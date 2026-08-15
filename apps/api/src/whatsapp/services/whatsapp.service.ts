import { Injectable } from '@nestjs/common';
import { OrderChannel, OrderStatus, StoreStatus } from '@prisma/client';
import type { Request } from 'express';
import { CheckoutService } from '../../checkout/services/checkout.service';
import { CheckoutView, toCheckoutView } from '../../checkout/checkout.types';
import { ConflictError, NotFoundError } from '../../common/errors/domain-exceptions';
import { CustomerRepository } from '../../customer/repositories/customer.repository';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { OrderRepository } from '../../orders/repositories/order.repository';
import { PaymentsService } from '../../payments/services/payments.service';
import { StoreSettingsService } from '../../store-settings/services/store-settings.service';
import { isWhatsAppAvailable } from '../../store-settings/domain/whatsapp-config';
import { StorefrontStoreResolver } from '../../storefront/services/storefront-store-resolver';
import { WhatsAppOrderRequestDto } from '../dto/whatsapp-order-request.dto';
import { buildWhatsAppOrderMessage, WhatsappMessageItem } from '../domain/whatsapp-message';
import { buildWhatsAppUrl } from '../domain/whatsapp-url';

/** Result returned to the customer after a WhatsApp order is created/reused. */
export interface WhatsAppOrderResult {
  order: CheckoutView;
  /** wa.me deep link with the pre-filled order message. */
  whatsappUrl: string;
}

/**
 * WhatsApp order application service (Phase 22).
 *
 * The customer-facing "Order via WhatsApp" flow creates a REAL order through
 * the EXISTING checkout pipeline (server-side revalidation of store/cart/
 * product/variant/price/inventory/customer/address) and then opens WhatsApp
 * with a pre-filled order message. No duplicate order system: the same
 * idempotency key returns the same order, and an `orderId` from an earlier
 * online checkout is REUSED (transitioned to the WHATSAPP channel) instead of
 * creating a second order.
 *
 * - Tenant: the store is ALWAYS resolved server-side by StorefrontStoreResolver
 *   (X-Storefront-Slug / Host) — a client-supplied store id is never accepted.
 * - WhatsApp must be enabled + have a valid number, else the operation fails
 *   closed (409) — a customer cannot place a WhatsApp order for a merchant who
 *   disabled it.
 * - The order stays OrderStatus.PENDING and NO payment record is created:
 *   the merchant confirms it manually (PENDING -> CONFIRMED) through the
 *   normal Orders lifecycle; reservation consumption happens at that
 *   confirmation (OrdersService), never automatically.
 * - No secrets/internal ids are placed in the WhatsApp message.
 */
@Injectable()
export class WhatsappService {
  constructor(
    private readonly storeResolver: StorefrontStoreResolver,
    private readonly settings: StoreSettingsService,
    private readonly checkoutService: CheckoutService,
    private readonly orders: OrderRepository,
    private readonly customers: CustomerRepository,
    private readonly payments: PaymentsService,
    private readonly transaction: TransactionService,
  ) {}

  async createWhatsAppOrder(input: {
    request: Pick<Request, 'headers'>;
    guestToken?: string;
    dto: WhatsAppOrderRequestDto;
    idempotencyKey?: string;
  }): Promise<WhatsAppOrderResult> {
    const store = await this.storeResolver.resolve(input.request);

    // Fail closed when the merchant disabled WhatsApp or the number is invalid.
    const whatsapp = await this.settings.readWhatsAppSettings(store.id);
    if (!isWhatsAppAvailable(whatsapp)) {
      throw new ConflictError('WhatsApp ordering is not enabled for this store.');
    }

    // Resolve the order: reuse an existing order (fallback) or create a new one
    // through the authoritative checkout pipeline (channel = WHATSAPP).
    const order = input.dto.orderId
      ? await this.resolveExistingOrder(store.id, input.dto.orderId)
      : await this.createWhatsAppOrderThroughCheckout(input);

    // Customer display name for the message (store-scoped lookup; falls back to
    // the customer-typed name — their own data echoed into their own message).
    let customerName = input.dto.customer.name;
    if (order.customerId) {
      const customer = await this.customers.findById(store.id, order.customerId);
      if (customer) {
        const fullName = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim();
        if (fullName) {
          customerName = fullName;
        }
      }
    }

    const message = buildWhatsAppOrderMessage(
      {
        orderNumber: order.orderNumber,
        items: order.items.map(
          (item): WhatsappMessageItem => ({
            productName: item.productNameSnapshot,
            variantName: item.variantNameSnapshot,
            quantity: item.quantity,
            lineTotal: item.lineTotal,
          }),
        ),
        currency: order.currency,
        subtotal: order.subtotal,
        shippingTotal: order.shippingTotal,
        grandTotal: order.grandTotal,
        customerName,
        customerPhone: order.customerPhone,
        customerEmail: order.customerEmail,
        shippingAddress: order.shippingAddressSnapshot as Record<string, unknown> | null,
      },
      input.dto.lang ?? 'en',
    );

    const whatsappUrl = buildWhatsAppUrl(whatsapp.phoneNumber, message);

    return { order: toCheckoutView(order), whatsappUrl };
  }

  /**
   * Reuses an order already created during this checkout session (the
   * online-payment failure fallback) instead of creating a duplicate.
   * Only a PENDING order without an active online payment may switch channel.
   */
  private async resolveExistingOrder(storeId: string, orderId: string) {
    const order = await this.orders.findWithDetails(storeId, orderId);
    if (!order) {
      throw new NotFoundError('The order was not found.');
    }
    if (order.channel === OrderChannel.WHATSAPP) {
      return order; // idempotent retry — no state change needed
    }
    if (order.status !== OrderStatus.PENDING) {
      throw new ConflictError('This order can no longer be placed via WhatsApp.');
    }
    if (await this.payments.hasActivePayment(order.id, storeId)) {
      throw new ConflictError(
        'This order already has an active online payment. Complete it online instead.',
      );
    }

    await this.transaction.runWithTenant(storeId, async (tx) => {
      const { count } = await this.orders.transitionChannel(
        tx,
        storeId,
        order.id,
        OrderChannel.ONLINE_PAYMENT,
        OrderChannel.WHATSAPP,
      );
      if (count === 0) {
        // A concurrent operation already switched/updated the order — the
        // fallback re-checks the current channel and fails closed if needed.
        const current = await this.orders.findWithDetailsTx(tx, storeId, order.id);
        if (!current || current.channel !== OrderChannel.WHATSAPP) {
          throw new ConflictError('The order could not be switched to WhatsApp.');
        }
      }
    });

    const updated = await this.orders.findWithDetails(storeId, order.id);
    if (!updated) {
      throw new NotFoundError('The order was not found.');
    }
    return updated;
  }

  /** Creates a fresh WHATSAPP-channel order through the authoritative checkout. */
  private async createWhatsAppOrderThroughCheckout(input: {
    request: Pick<Request, 'headers'>;
    guestToken?: string;
    dto: WhatsAppOrderRequestDto;
    idempotencyKey?: string;
  }) {
    const store = await this.storeResolver.resolve(input.request);
    const view = await this.checkoutService.createCheckout(
      input.dto,
      input.guestToken,
      input.idempotencyKey,
      store.id,
      StoreStatus.ACTIVE,
      OrderChannel.WHATSAPP,
    );
    const order = await this.orders.findWithDetails(store.id, view.orderId);
    if (!order) {
      throw new NotFoundError('The order was not found.');
    }
    return order;
  }
}
