import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Cart,
  CartStatus,
  Prisma,
  ProductStatus,
  ProductVariant,
  VariantStatus,
} from '@prisma/client';
import { requireStoreId } from '../../catalog/domain/catalog-tenant';
import { ProductRepository } from '../../catalog/repositories/product.repository';
import { ProductVariantRepository } from '../../catalog/repositories/product-variant.repository';
import { RequestContextService } from '../../common/context/request-context.service';
import {
  ConflictError,
  InsufficientInventoryError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/domain-exceptions';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { InventoryService } from '../../inventory/services/inventory.service';
import { CartView, toCartView } from '../cart.types';
import { mapCartWriteError } from '../domain/cart-error.mapper';
import { generateGuestToken } from '../domain/cart-guest-token';
import { assertCartUsable, isCartExpiredDue } from '../domain/cart-status';
import { AddCartItemDto } from '../dto/add-cart-item.dto';
import { UpdateCartItemDto } from '../dto/update-cart-item.dto';
import { CartItemRepository } from '../repositories/cart-item.repository';
import { CartRepository } from '../repositories/cart.repository';

/**
 * Cart application service (docs/API-SPEC.md §21, docs/DOMAIN-MODEL.md §10,
 * docs/DATABASE.md §7.14/§7.15/§17).
 *
 * Business rules implemented here:
 *
 * - **Tenant**: every operation is store-scoped through the trusted tenant
 *   context (Authenticated User -> ACTIVE StoreMembership -> Store). The
 *   client-supplied X-Guest-Token only selects a cart INSIDE that store; it is
 *   never an authorization source. Cross-tenant access fails closed with
 *   NOT_FOUND (no existence leak). All writes run inside
 *   `TransactionService.runWithTenant(storeId, ...)` (RLS sees the correct
 *   tenant and the pooled connection never retains state).
 * - **Identity**: guest carts only (opaque server-generated token). The
 *   customer_id path is reserved for future customer authentication
 *   (customers.auth_user_id — docs/DATABASE.md §18.2) and is not wired here.
 * - **Purchasability** (US-CART-001): a variant is added only when the variant
 *   AND its product exist in the store and are ACTIVE. An archived/unpublished
 *   variant or product can never enter a cart (CONFLICT).
 * - **Quantity**: positive integer (DB CHECK quantity > 0). One line per
 *   variant per cart — UNIQUE (cart_id, variant_id): adding an existing variant
 *   MERGES quantity instead of creating a duplicate line.
 * - **Pricing**: no price is stored (cart_items has no price column); the view
 *   carries the CURRENT variant prices for display only. Cart pricing is NOT
 *   authoritative — checkout revalidates everything.
 * - **Inventory boundary**: availability (on_hand - reserved) is validated on
 *   add/update; inventory is NOT reserved here (reservation belongs to
 *   checkout, docs/DEVELOPMENT-ROADMAP.md §10-11). A missing inventory row
 *   fails closed with INSUFFICIENT_INVENTORY (mirrors the Inventory rule that a
 *   missing row is never rendered as zero).
 * - **Lifecycle**: ACTIVE is usable; EXPIRED (lazy evaluation + sweep) and
 *   COMPLETED carts are never mutated (STATE_TRANSITION). No merge/recovery.
 */
@Injectable()
export class CartService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly carts: CartRepository,
    private readonly items: CartItemRepository,
    private readonly variants: ProductVariantRepository,
    private readonly products: ProductRepository,
    private readonly inventoryService: InventoryService,
    private readonly transaction: TransactionService,
    private readonly config: ConfigService,
  ) {}

  /**
   * GET /api/v1/cart — resolved from the guest/session context.
   *
   * `storeId` is optional: the merchant path resolves it from the trusted
   * tenant context; the public storefront path passes the store resolved
   * server-side by the StorefrontStoreResolver (never client input).
   */
  async getCart(guestToken?: string, storeId?: string): Promise<CartView> {
    const resolvedStoreId = this.resolveStoreId(storeId);
    const cart = await this.resolveGuestCart(resolvedStoreId, guestToken);
    const current = await this.lazyExpire(cart);
    return this.buildCartView(resolvedStoreId, current.id);
  }

  /**
   * POST /api/v1/cart/items — create the cart on first use, merge on
   * duplicate variant. `storeId` is optional (trusted storefront path).
   */
  async addItem(guestToken: string | undefined, dto: AddCartItemDto, storeId?: string): Promise<CartView> {
    const resolvedStoreId = this.resolveStoreId(storeId);

    // Resolve the authoritative variant + product ownership/status FIRST (never
    // from the client). The variant must be purchasable (variant + product ACTIVE).
    const variant = await this.requirePurchasableVariant(resolvedStoreId, dto.variantId);

    try {
      const cart = await this.transaction.runWithTenant(resolvedStoreId, async (tx) => {
        // Resolve the session cart, or create a new guest cart on first use.
        // New carts carry an abandoned-cart expiry (CART_TTL_MS) so the
        // periodic sweep can transition untouched carts ACTIVE -> EXPIRED.
        const cart = guestToken
          ? await this.resolveGuestCartTx(tx, resolvedStoreId, guestToken)
          : await this.carts.create(tx, {
              storeId: resolvedStoreId,
              guestToken: generateGuestToken(),
              expiresAt: new Date(Date.now() + this.cartTtlMs()),
            });

        await this.assertCartUsableAfterExpiry(tx, cart);

        // One line per variant per cart: add merges quantity (docs/DATABASE.md §7.15).
        const existing = await this.items.findByVariantTx(tx, cart.id, variant.id);
        const targetQuantity = existing ? existing.quantity + dto.quantity : dto.quantity;

        // Advisory availability check — Cart validates but does NOT reserve.
        await this.assertInventoryAvailable(resolvedStoreId, variant.id, targetQuantity);

        if (existing) {
          await this.items.updateQuantity(tx, cart.id, existing.id, targetQuantity);
        } else {
          await this.items.create(tx, {
            cartId: cart.id,
            variantId: variant.id,
            quantity: dto.quantity,
          });
        }

        return cart;
      });

      return this.buildCartView(resolvedStoreId, cart.id);
    } catch (error) {
      throw mapCartWriteError(error);
    }
  }

  /**
   * PATCH /api/v1/cart/items/:itemId — replace the line quantity.
   * `storeId` is optional (trusted storefront path).
   */
  async updateItem(
    guestToken: string | undefined,
    itemId: string,
    dto: UpdateCartItemDto,
    storeId?: string,
  ): Promise<CartView> {
    const resolvedStoreId = this.resolveStoreId(storeId);
    const cart = await this.resolveGuestCart(resolvedStoreId, guestToken);
    const current = await this.lazyExpire(cart);
    assertCartUsable(current);

    const item = await this.items.findById(current.id, itemId);
    if (!item) {
      throw new NotFoundError('The cart item was not found.');
    }

    // Revalidate the variant it references (item -> variant FK is RESTRICT, but
    // ownership/status must be checked in the trusted store; an item of another
    // store's cart can never match because the cart itself is store-scoped).
    const variant = await this.requirePurchasableVariant(resolvedStoreId, item.variantId);

    await this.assertInventoryAvailable(resolvedStoreId, variant.id, dto.quantity);

    try {
      const { count } = await this.transaction.runWithTenant(resolvedStoreId, (tx) =>
        this.items.updateQuantity(tx, current.id, itemId, dto.quantity),
      );
      if (count === 0) {
        // The item vanished (e.g. concurrent clear-cart) between the read and write.
        throw new NotFoundError('The cart item was not found.');
      }
    } catch (error) {
      throw mapCartWriteError(error);
    }

    return this.buildCartView(resolvedStoreId, current.id);
  }

  /**
   * DELETE /api/v1/cart/items/:itemId.
   * `storeId` is optional (trusted storefront path).
   */
  async removeItem(guestToken: string | undefined, itemId: string, storeId?: string): Promise<void> {
    const resolvedStoreId = this.resolveStoreId(storeId);
    const cart = await this.resolveGuestCart(resolvedStoreId, guestToken);
    const current = await this.lazyExpire(cart);
    assertCartUsable(current);

    try {
      const { count } = await this.transaction.runWithTenant(resolvedStoreId, (tx) =>
        this.items.delete(tx, current.id, itemId),
      );
      if (count === 0) {
        throw new NotFoundError('The cart item was not found.');
      }
    } catch (error) {
      throw mapCartWriteError(error);
    }
  }

  /**
   * DELETE /api/v1/cart/items — clear the cart (idempotent on an empty cart).
   * `storeId` is optional (trusted storefront path).
   */
  async clearCart(guestToken: string | undefined, storeId?: string): Promise<void> {
    const resolvedStoreId = this.resolveStoreId(storeId);
    const cart = await this.resolveGuestCart(resolvedStoreId, guestToken);
    const current = await this.lazyExpire(cart);
    assertCartUsable(current);

    await this.transaction.runWithTenant(resolvedStoreId, (tx) =>
      this.items.deleteManyByCart(tx, current.id),
    );
  }

  /**
   * Cart expiration sweep (docs/DATABASE.md §11/§17.4). Lazy evaluation already
   * expires a cart when it is accessed; this callable unit (per Store, bounded
   * batch) handles carts nobody touches. No HTTP endpoint — API-SPEC defines
   * none. `storeId` comes from the trusted tenant context.
   */
  async expireDueCarts(batchSize = 100): Promise<{ scanned: number; expired: number }> {
    return this.expireDueCartsForStore(requireStoreId(this.requestContext), batchSize);
  }

  /**
   * Store-driven cart expiration sweep — the callable unit used by the Phase 21
   * periodic maintenance job (no request context required). Idempotent: the
   * guarded ACTIVE -> EXPIRED transition affects zero rows for carts a
   * concurrent operation already transitioned.
   */
  async expireDueCartsForStore(
    storeId: string,
    batchSize = 100,
  ): Promise<{ scanned: number; expired: number }> {
    if (!Number.isInteger(batchSize) || batchSize <= 0) {
      throw new ValidationError('Batch size must be a positive integer.');
    }

    const due = await this.carts.findDueForExpiration(storeId, new Date(), batchSize);

    let expired = 0;
    for (const cart of due) {
      const { count } = await this.transaction.runWithTenant(storeId, (tx) =>
        this.carts.transitionStatus(tx, storeId, cart.id, CartStatus.ACTIVE, CartStatus.EXPIRED),
      );
      if (count > 0) {
        expired += 1;
      }
    }

    return { scanned: due.length, expired };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Resolves the guest cart of the trusted store; unknown/missing token -> 404. */
  private async resolveGuestCart(storeId: string, guestToken?: string): Promise<Cart> {
    if (!guestToken) {
      throw new NotFoundError('No cart was found for this session.');
    }
    const cart = await this.carts.findByGuestToken(storeId, guestToken);
    if (!cart) {
      throw new NotFoundError('No cart was found for this session.');
    }
    return cart;
  }

  /** Same lookup inside the caller's transaction. */
  private async resolveGuestCartTx(
    tx: Prisma.TransactionClient,
    storeId: string,
    guestToken: string,
  ): Promise<Cart> {
    const cart = await this.carts.findByGuestTokenTx(tx, storeId, guestToken);
    if (!cart) {
      throw new NotFoundError('No cart was found for this session.');
    }
    return cart;
  }

  /**
   * Lazy expiration (docs/DATABASE.md §17.4): an ACTIVE cart whose expires_at
   * has passed is transitioned ACTIVE -> EXPIRED before the operation proceeds.
   * The transition is guarded (WHERE status = 'ACTIVE') so concurrent
   * expiration/checkout can never double-apply.
   */
  private async lazyExpire(cart: Cart): Promise<Cart> {
    if (!isCartExpiredDue(cart, new Date())) {
      return cart;
    }
    const { count } = await this.transaction.runWithTenant(cart.storeId, (tx) =>
      this.carts.transitionStatus(tx, cart.storeId, cart.id, CartStatus.ACTIVE, CartStatus.EXPIRED),
    );
    if (count === 0) {
      return cart; // a concurrent operation already transitioned it; keep the caller's row
    }
    return { ...cart, status: CartStatus.EXPIRED };
  }

  /** Lazy-expires inside the caller's transaction, then asserts the cart is usable. */
  private async assertCartUsableAfterExpiry(
    tx: Prisma.TransactionClient,
    cart: Cart,
  ): Promise<void> {
    let current = cart;
    if (isCartExpiredDue(current, new Date())) {
      await this.carts.transitionStatus(
        tx,
        current.storeId,
        current.id,
        CartStatus.ACTIVE,
        CartStatus.EXPIRED,
      );
      current = { ...current, status: CartStatus.EXPIRED };
    }
    assertCartUsable(current);
  }

  /**
   * Resolves the trusted tenant store id for a cart operation.
   *
   * The merchant path derives it from the tenant context (Authenticated User
   * -> ACTIVE StoreMembership -> Store). The public storefront path passes
   * the store resolved SERVER-SIDE by the StorefrontStoreResolver — never
   * from client input (API-SPEC §33/§34).
   */
  private resolveStoreId(storeId?: string): string {
    return storeId ?? requireStoreId(this.requestContext);
  }

  /**
   * Resolves the variant + its product in the trusted tenant and enforces the
   * purchasability rule (docs/DOMAIN-MODEL.md §7.1/§7.2, US-CART-001): the
   * variant must exist in the current store, be ACTIVE, and its product must be
   * ACTIVE. A missing variant/product -> NOT_FOUND; a non-ACTIVE one exists but
   * is not purchasable -> CONFLICT (never silently added).
   */
  private async requirePurchasableVariant(
    storeId: string,
    variantId: string,
  ): Promise<ProductVariant> {
    const variant = await this.variants.findById(storeId, variantId);
    if (!variant) {
      throw new NotFoundError('The variant was not found.');
    }

    const product = await this.products.findById(storeId, variant.productId);
    if (!product) {
      // The FK contract makes this unreachable in practice; fail closed anyway.
      throw new NotFoundError('The product was not found.');
    }

    if (variant.status !== VariantStatus.ACTIVE || product.status !== ProductStatus.ACTIVE) {
      throw new ConflictError('This variant is not currently purchasable.');
    }

    return variant;
  }

  /**
   * Availability pre-check (docs/DEVELOPMENT-ROADMAP.md §10 Cart Rules):
   * Cart validates inventory availability but does NOT reserve inventory —
   * reservation belongs to checkout. A missing inventory row fails closed with
   * INSUFFICIENT_INVENTORY, mirroring the Inventory phase rule that a missing
   * row is never rendered as zero.
   */
  private async assertInventoryAvailable(
    storeId: string,
    variantId: string,
    quantity: number,
  ): Promise<void> {
    let available: number;
    try {
      const inventory = await this.inventoryService.getInventory(variantId, storeId);
      available = inventory.available;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new InsufficientInventoryError('This variant has no available inventory.');
      }
      throw error;
    }

    if (available < quantity) {
      throw new InsufficientInventoryError(
        `Only ${available} unit(s) of this variant are available; requested ${quantity}.`,
      );
    }
  }

  /** Reloads the cart + items from the database for the API view. */
  private async buildCartView(storeId: string, cartId: string): Promise<CartView> {
    const cart = await this.carts.findById(storeId, cartId);
    if (!cart) {
      throw new NotFoundError('The cart was not found.');
    }
    const items = await this.items.findManyByCart(cartId);
    return toCartView(cart, items);
  }

  /** Abandoned-cart TTL (ms) from the environment (CART_TTL_MS, default 7 days). */
  private cartTtlMs(): number {
    const ttl = this.config.get<number>('expiry.cartTtlMs');
    return Number.isInteger(ttl) && (ttl as number) > 0 ? (ttl as number) : 7 * 24 * 60 * 60 * 1000;
  }
}
