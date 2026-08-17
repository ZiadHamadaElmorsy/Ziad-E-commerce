import { OrderPaymentStatus, PaymentStatus } from '@prisma/client';
import { toOrderView, OrderView } from '../orders/orders.types';

/**
 * Public Storefront commerce representations (Phase 19).
 *
 * The storefront cart/checkout/payment/order endpoints are @Public() (guest
 * customers, no merchant session). The Store is resolved server-side by the
 * existing StorefrontStoreResolver (X-Storefront-Slug header + Host subdomain)
 * and every operation delegates to the EXISTING Cart / Checkout / Orders /
 * Payments services with that resolved store id — no new cart/checkout/payment
 * implementation and no client-supplied store id is ever an authorization
 * source (docs/API-SPEC.md §33/§34, §36 "Public": cart operations where guest
 * sessions are supported, checkout initiation, payment redirect/result).
 */

/**
 * Public storefront order detail used by the customer order confirmation page.
 *
 * Phase 23 security hardening: the PUBLIC `GET /storefront/orders/:orderId`
 * endpoint never exposes customer PII unless the caller proves possession of
 * the order's lookup token (`?token=...`, returned at checkout). Without a
 * valid token the PII fields below are returned as null / an empty address so
 * the confirmation page still renders (order number, items, totals, status)
 * without leaking email/phone/address to anyone who merely obtained the URL.
 *
 * The provider-hosted checkout URL is only returned by the payment CREATION
 * response (Paymob iframe); it is never persisted, so this read view carries
 * only the payment lifecycle state (webhook-driven).
 */
export interface StorefrontOrderView extends OrderView {
  /**
   * Order-level payment status (Phase 27) — the authoritative customer-facing
   * payment state (PAID/UNPAID/FAILED/REFUNDED), kept SEPARATE from the
   * order lifecycle and the carrier shipment status. For online orders it is
   * driven by the Paymob webhook; for COD orders it becomes PAID only after
   * the carrier confirms delivery.
   */
  paymentStatus: OrderPaymentStatus;
  paymentFailureMessage: string | null;
}

/**
 * Builds the customer-facing order view from the order aggregate + payment.
 *
 * @param authorized true only when the caller presented the matching lookup
 *   token — the only case in which customer PII is included.
 */
export function toStorefrontOrderView(
  order: Parameters<typeof toOrderView>[0],
  payment: { status: PaymentStatus; failureMessage: string | null } | null,
  authorized: boolean,
): StorefrontOrderView {
  const full = toOrderView(order);
  if (authorized) {
    return {
      ...full,
      paymentStatus: order.paymentStatus,
      paymentFailureMessage: payment?.failureMessage ?? null,
    };
  }
  // PII-limited view: everything except the customer's identifying data. The
  // empty address object keeps the confirmation page rendering-safe.
  return {
    ...full,
    customerId: null,
    customerEmail: null,
    customerPhone: null,
    shippingAddress: {},
    billingAddress: null,
    paymentStatus: order.paymentStatus,
    paymentFailureMessage: payment?.failureMessage ?? null,
  };
}
