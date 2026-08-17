import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Cart,
  CartStatus,
  Customer,
  InventoryReservation,
  Order,
  OrderChannel,
  OrderItem,
  OrderPaymentMethod,
  OrderPaymentStatus,
  OrderStatus,
  Prisma,
  ProductStatus,
  StoreStatus,
  VariantStatus,
} from '@prisma/client';
import { isCartExpiredDue, assertCartUsable } from '../../cart/domain/cart-status';
import { CartItemRepository } from '../../cart/repositories/cart-item.repository';
import { CartRepository } from '../../cart/repositories/cart.repository';
import { requireStoreId } from '../../catalog/domain/catalog-tenant';
import { RequestContextService } from '../../common/context/request-context.service';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  StateTransitionError,
} from '../../common/errors/domain-exceptions';
import { CustomerRepository } from '../../customer/repositories/customer.repository';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { InventoryReservationRepository } from '../../inventory/repositories/inventory-reservation.repository';
import { InventoryReservationService } from '../../inventory/services/inventory-reservation.service';
import { CheckoutView, toCheckoutView } from '../checkout.types';
import { nextOrderNumber } from '../domain/checkout-order-number';
import { splitCustomerName } from '../domain/checkout-customer-name';
import { generateOrderLookupToken } from '../domain/order-lookup-token';
import { isUniqueViolation, mapCheckoutWriteError } from '../domain/checkout-error.mapper';
import { CheckoutRequestDto } from '../dto/checkout-request.dto';
import {
  CreateOrderInput,
  CreateOrderItemInput,
  OrderRepository,
} from '../repositories/order.repository';

/** Bounded whole-checkout retries for transient UNIQUE collisions. */
const MAX_CHECKOUT_ATTEMPTS = 5;

/**
 * A cart line with revalidated authoritative purchase-time data.
 * `unitPrice`/`lineTotal` are BIGINT integer minor units — never floats.
 */
interface CheckoutLine {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string | null;
  unitPrice: bigint;
  quantity: number;
  lineTotal: bigint;
}

/** Cart item shape as loaded by CartItemRepository.findManyByCartTx. */
type CheckoutCartItem = Prisma.CartItemGetPayload<{
  include: { variant: { include: { product: true } } };
}>;

/**
 * Checkout application service (docs/API-SPEC.md §22, docs/DOMAIN-MODEL.md §11,
 * docs/DATABASE.md §28.1).
 *
 * Checkout is an orchestration boundary, NOT a persistent entity — no checkout
 * table or record is ever written. The one transaction performs:
 *
 *   Resolve Store (status) -> Load Cart -> revalidate product/variant/price/
 *   quantity/totals -> resolve/create Customer -> reserve inventory (atomic
 *   guarded increments) -> create PENDING Order + snapshot OrderItems +
 *   order_number -> link reservations to the order -> complete the Cart.
 *
 * Any step failure rolls the WHOLE transaction back (no partial order, no
 * orphaned reservations, no cart completed without an order — DATABASE §28.1).
 *
 * - **Tenant**: storeId always comes from the trusted tenant context
 *   (Authenticated User -> ACTIVE StoreMembership -> Store). The client-supplied
 *   X-Guest-Token only selects a cart INSIDE that store. Cross-tenant access
 *   fails closed with NOT_FOUND (no existence leak).
 * - **Pricing**: authoritative ProductVariant prices are reloaded from the
 *   database inside the transaction (Cart pricing is NOT authoritative). No
 *   client-provided price/total is ever trusted (API-SPEC §22).
 * - **Inventory**: reservation uses the existing InventoryReservationService
 *   atomic guarded increment (no read-then-write availability decision) inside
 *   this same transaction. Stock is RESERVED (not consumed) — consumption
 *   belongs to the later Payment phase.
 * - **Customer**: guest checkout supported. A Store-scoped Customer is found
 *   by email when provided, otherwise created (docs/DATABASE.md §18.2).
 * - **Order boundary**: only the minimal persistence Checkout requires — the
 *   PENDING order aggregate with snapshot items. No order endpoints, no order
 *   lifecycle APIs.
 * - **Payment boundary**: NO payment records/attempts are created here.
 *   Payment initiation belongs to the Payments phase (roadmap Phase 10).
 * - **Idempotency**: an optional client Idempotency-Key is honored
 *   (docs/DATABASE.md §27.2). `UNIQUE (store_id, idempotency_key)` is the
 *   concurrency barrier; a retry returns the existing order and creates no
 *   duplicate order or reservations (§15.7/§27.1).
 */
@Injectable()
export class CheckoutService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly carts: CartRepository,
    private readonly items: CartItemRepository,
    private readonly reservations: InventoryReservationService,
    private readonly reservationRepository: InventoryReservationRepository,
    private readonly customers: CustomerRepository,
    private readonly orders: OrderRepository,
    private readonly transaction: TransactionService,
    private readonly config: ConfigService,
  ) {}

  /**
   * POST /api/v1/checkout — creates (or idempotently returns) the PENDING
   * order for the guest cart identified by `guestToken`.
   *
   * `storeId`/`storeStatus` are optional: the merchant path resolves them from
   * the trusted tenant context; the public storefront path passes the store
   * resolved SERVER-SIDE by the StorefrontStoreResolver (which already asserts
   * ACTIVE + subscription availability) — never from client input.
   */
  async createCheckout(
    dto: CheckoutRequestDto,
    guestToken?: string,
    idempotencyKey?: string,
    storeId?: string,
    storeStatus?: StoreStatus,
    channel: OrderChannel = OrderChannel.ONLINE_PAYMENT,
    paymentMethod: OrderPaymentMethod = OrderPaymentMethod.ONLINE,
  ): Promise<CheckoutView> {
    const resolvedStoreId = storeId ?? requireStoreId(this.requestContext);
    const resolvedStoreStatus = storeStatus ?? this.requestContext.getCurrent()?.store?.status;

    // Store availability (docs/DOMAIN-MODEL.md §11, docs/MVP-SCOPE.md §16,
    // docs/DATABASE.md §28.1 step 1). The store is the trusted tenant context;
    // only ACTIVE stores accept checkouts. On the public path the
    // StorefrontStoreResolver already asserted ACTIVE + subscription
    // availability, so this is defense in depth. The subscription access
    // overlay belongs to the later Subscriptions phase (roadmap §16).
    if (resolvedStoreStatus !== StoreStatus.ACTIVE) {
      throw new ConflictError('The store is not currently available for checkout.');
    }

    // Bounded whole-transaction retries: a Postgres UNIQUE violation aborts the
    // current transaction block, so transient collisions (order_number,
    // concurrent same-email customer) are resolved by re-running the checkout
    // cleanly. The idempotency-key race is special-cased: it returns the
    // winner's order instead of retrying.
    for (let attempt = 0; attempt < MAX_CHECKOUT_ATTEMPTS; attempt++) {
      try {
        const outcome = await this.transaction.runWithTenant(resolvedStoreId, (tx) =>
          this.runCheckoutTransaction(
            tx,
            resolvedStoreId,
            dto,
            guestToken,
            idempotencyKey,
            channel,
            paymentMethod,
          ),
        );
        return toCheckoutView({
          ...outcome.order,
          reservations: outcome.reservations,
        });
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw mapCheckoutWriteError(error);
        }
        // UNIQUE collision: if an order already exists for this idempotency
        // key, a concurrent request won — return it (docs/DATABASE.md §27.1).
        if (idempotencyKey) {
          const existing = await this.orders.findByStoreAndIdempotencyKey(
            resolvedStoreId,
            idempotencyKey,
          );
          if (existing) {
            return toCheckoutView(existing);
          }
        }
        // Otherwise (order_number collision or a concurrent same-email customer
        // race) retry the whole transaction with fresh state.
      }
    }

    throw new ConflictError('The checkout could not be completed; please retry.');
  }

  // ---------------------------------------------------------------------------
  // Checkout transaction
  // ---------------------------------------------------------------------------

  private async runCheckoutTransaction(
    tx: Prisma.TransactionClient,
    storeId: string,
    dto: CheckoutRequestDto,
    guestToken: string | undefined,
    idempotencyKey: string | undefined,
    channel: OrderChannel,
    paymentMethod: OrderPaymentMethod,
  ): Promise<{
    order: Order & { items: OrderItem[] };
    reservations: InventoryReservation[];
  }> {
    // 1. Resolve the cart by its opaque guest token INSIDE the trusted store.
    //    The token is a lookup key only — never an authorization source.
    const cart = guestToken ? await this.carts.findByGuestTokenTx(tx, storeId, guestToken) : null;
    if (!cart) {
      throw new NotFoundError('No cart was found for this session.');
    }

    // 2. Cart lifecycle (reused from the Cart phase, docs/DATABASE.md §17.4):
    //    lazy-expire an ACTIVE cart whose expires_at passed, then assert the
    //    cart is usable (ACTIVE; not EXPIRED, not COMPLETED).
    if (isCartExpiredDue(cart, new Date())) {
      await this.carts.transitionStatus(
        tx,
        storeId,
        cart.id,
        CartStatus.ACTIVE,
        CartStatus.EXPIRED,
      );
      throw new StateTransitionError('The cart has expired and is no longer usable.');
    }
    assertCartUsable(cart);

    // 3. Idempotency short-circuit: a successful checkout with the same key
    //    already produced an order — return it (no duplicate order, no
    //    duplicate reservations — docs/DATABASE.md §15.7/§27.1).
    if (idempotencyKey) {
      const existing = await this.orders.findByStoreAndIdempotencyKeyTx(
        tx,
        storeId,
        idempotencyKey,
      );
      if (existing) {
        const withDetails = await this.orders.findWithDetailsTx(tx, storeId, existing.id);
        if (withDetails) {
          return { order: withDetails, reservations: withDetails.reservations };
        }
      }
    }

    // 4. A checkout requires a non-empty cart.
    const cartItems = (await this.items.findManyByCartTx(tx, cart.id)) as CheckoutCartItem[];
    if (cartItems.length === 0) {
      throw new BadRequestError('The cart is empty; add items before checking out.');
    }

    // 5. Revalidate every line against the authoritative catalog + calculate
    //    totals with integer arithmetic (BigInt minor units).
    const lines = cartItems.map((item) => this.revalidateLine(storeId, item));
    const subtotal = lines.reduce((total, line) => total + line.lineTotal, 0n);

    // 6. Find or create the Store-scoped Customer (docs/DATABASE.md §18.2,
    //    US-CUST-001). Guest checkout is supported; a Customer record is
    //    created for merchant-side order management even for guests.
    const customer = await this.resolveCustomerTx(tx, storeId, dto);

    // 7. Reserve inventory BEFORE the order exists (docs/DATABASE.md §28.1
    //    step 3). The atomic guarded increment inside reserveTx is the ONLY
    //    availability decision — never a read-then-write check. Stock is
    //    reserved (not consumed); consumption belongs to the Payment phase.
    //    Reservations carry a bounded TTL (RESERVATION_TTL_MS) so abandoned
    //    checkouts cannot hold inventory forever — the Phase 21 expiry sweep
    //    releases them once expires_at passes (docs/DATABASE.md §14.2).
    const reservationExpiresAt = new Date(
      Date.now() + this.reservationTtlMs(),
    );
    const reserved: InventoryReservation[] = [];
    for (const line of lines) {
      reserved.push(
        await this.reservations.reserveTx(tx, storeId, line.variantId, line.quantity, {
          cartId: cart.id,
        }, reservationExpiresAt),
      );
    }

    // 8. Create the PENDING order + snapshot order items + order_number
    //    (docs/DATABASE.md §28.1 step 4, docs/DOMAIN-MODEL.md §12.2).
    const order = await this.createOrder(tx, storeId, {
      dto,
      cart,
      customer,
      lines,
      subtotal,
      idempotencyKey,
      channel,
      paymentMethod,
    });

    // 9. Link the reservations to the order (docs/DATABASE.md §28.1 step 5) —
    //    afterwards order_id is the authoritative release/consume link.
    if (reserved.length > 0) {
      await this.reservationRepository.linkOrderForCart(tx, storeId, cart.id, order.id);
    }

    // 10. Complete the cart — a fulfilled cart is never reused (docs/DATABASE.md
    //     §17.4). The guarded ACTIVE -> COMPLETED transition rolls the whole
    //     checkout back if a concurrent request already completed the cart,
    //     so one cart can never produce two orders.
    const { count } = await this.carts.complete(tx, storeId, cart.id);
    if (count === 0) {
      throw new StateTransitionError('The cart has already been completed.');
    }

    return { order, reservations: reserved };
  }

  // ---------------------------------------------------------------------------
  // Revalidation
  // ---------------------------------------------------------------------------

  /**
   * Authoritative per-line revalidation (docs/DOMAIN-MODEL.md §11,
   * docs/MVP-SCOPE.md §16): product ACTIVE, variant ACTIVE, current price from
   * the database (Cart pricing is NOT authoritative), positive quantity.
   * Ownership is verified against the trusted store (defense-in-depth: the
   * cart_item -> variant FK is not composite, so a cross-store variant is
   * rejected here even if it ever existed).
   */
  private revalidateLine(storeId: string, item: CheckoutCartItem): CheckoutLine {
    const variant = item.variant;
    const product = variant?.product;

    if (!variant || !product) {
      // RLS blocked the include or the rows vanished — fail closed, no leak.
      throw new NotFoundError('A cart item references an unavailable variant.');
    }
    if (variant.storeId !== storeId || product.storeId !== storeId) {
      throw new NotFoundError('A cart item references an unavailable variant.');
    }
    if (product.status !== ProductStatus.ACTIVE) {
      throw new ConflictError('A product in this cart is no longer available for purchase.');
    }
    if (variant.status !== VariantStatus.ACTIVE) {
      throw new ConflictError('A variant in this cart is no longer available for purchase.');
    }

    const unitPrice = variant.price;
    if (unitPrice < 0n) {
      // Defensive: the FINAL CHECK (price >= 0) already guarantees this at the DB.
      throw new ConflictError('A variant in this cart has an invalid price.');
    }

    const quantity = item.quantity;
    return {
      variantId: variant.id,
      productId: variant.productId,
      productName: product.name,
      variantName: variant.name,
      sku: variant.sku,
      unitPrice,
      quantity,
      lineTotal: unitPrice * BigInt(quantity),
    };
  }

  // ---------------------------------------------------------------------------
  // Customer
  // ---------------------------------------------------------------------------

  /**
   * Find-or-create the Store-scoped customer (docs/DATABASE.md §18.2,
   * US-CUST-001). Customers are deduplicated by email (UNIQUE (store_id, email)).
   * A concurrent same-email checkout creates a UNIQUE violation that aborts this
   * transaction; the caller's whole-checkout retry then finds the winner's
   * customer via the pre-check. Customers without an email are always created
   * (no documented phone-keyed deduplication). The reusable Customer record is
   * never mutated with checkout-time contact changes.
   */
  private async resolveCustomerTx(
    tx: Prisma.TransactionClient,
    storeId: string,
    dto: CheckoutRequestDto,
  ): Promise<Customer> {
    const { name, phone, email } = dto.customer;
    const { firstName, lastName } = splitCustomerName(name);

    if (email) {
      const existing = await this.customers.findByEmailTx(tx, storeId, email);
      if (existing) {
        return existing;
      }
    }

    return this.customers.create(tx, {
      storeId,
      ...(email ? { email } : {}),
      phone,
      firstName,
      lastName,
    });
  }

  // ---------------------------------------------------------------------------
  // Order creation
  // ---------------------------------------------------------------------------

  /**
   * Creates the PENDING order aggregate with snapshot items and a fresh
   * order_number. Order numbers are unique per Store (docs/DATABASE.md §15.4);
   * a collision aborts this transaction and is retried by the caller with a
   * fresh number.
   */
  private async createOrder(
    tx: Prisma.TransactionClient,
    storeId: string,
    input: {
      dto: CheckoutRequestDto;
      cart: Cart;
      customer: Customer;
      lines: CheckoutLine[];
      subtotal: bigint;
      idempotencyKey: string | undefined;
      channel: OrderChannel;
      paymentMethod: OrderPaymentMethod;
    },
  ): Promise<Order & { items: OrderItem[] }> {
    // MVP totals: discount/shipping/tax engines are out of scope
    // (docs/DATABASE.md §7.16 — discount_total defaults to 0; shipping/tax are
    // written as 0 so the grand_total consistency CHECK holds).
    const zero = 0n;
    const orderData: CreateOrderInput = {
      storeId,
      orderNumber: '',
      channel: input.channel,
      // Phase 27 — payment method (ONLINE | COD) + order-level payment status.
      // COD orders are created UNPAID and become PAID only after the carrier
      // confirms delivery/collection (Part 11); online orders become PAID on
      // the Paymob webhook confirmation (Part 6).
      paymentMethod: input.paymentMethod,
      paymentStatus: OrderPaymentStatus.UNPAID,
      customerId: input.customer.id,
      status: OrderStatus.PENDING,
      currency: input.cart.currency,
      subtotal: input.subtotal,
      discountTotal: zero,
      shippingTotal: zero,
      taxTotal: zero,
      grandTotal: input.subtotal,
      customerEmail: input.dto.customer.email ?? null,
      customerPhone: input.dto.customer.phone,
      // Purchase-time shipping snapshot (docs/DATABASE.md §15.3) — the address
      // is copied into the order and NEVER depends on reusable address rows.
      shippingAddressSnapshot: this.buildShippingSnapshot(input.dto.shippingAddress),
      billingAddressSnapshot: Prisma.DbNull,
      idempotencyKey: input.idempotencyKey ?? null,
      // Phase 23 — a fresh 192-bit lookup token gates PII on the public
      // storefront order confirmation endpoint (order-lookup-token.ts).
      lookupToken: generateOrderLookupToken(),
    };

    const itemData: CreateOrderItemInput[] = input.lines.map((line) => ({
      productId: line.productId,
      variantId: line.variantId,
      productNameSnapshot: line.productName,
      variantNameSnapshot: line.variantName,
      skuSnapshot: line.sku,
      unitPrice: line.unitPrice,
      quantity: line.quantity,
      lineTotal: line.lineTotal,
    }));

    const orderNumber = await nextOrderNumber(tx, storeId);
    return this.orders.create(tx, { ...orderData, orderNumber }, itemData);
  }

  /** The purchase-time shipping snapshot (docs/DATABASE.md §7.16 §15.3). */
  private buildShippingSnapshot(
    address: CheckoutRequestDto['shippingAddress'],
  ): Prisma.InputJsonValue {
    return {
      governorate: address.governorate,
      city: address.city,
      addressLine: address.addressLine,
      ...(address.building !== undefined ? { building: address.building } : {}),
      ...(address.apartment !== undefined ? { apartment: address.apartment } : {}),
    };
  }

  /** Reservation TTL (ms) from the environment (RESERVATION_TTL_MS, default 30m). */
  private reservationTtlMs(): number {
    const ttl = this.config.get<number>('expiry.reservationTtlMs');
    return Number.isInteger(ttl) && (ttl as number) > 0 ? (ttl as number) : 30 * 60 * 1000;
  }
}
