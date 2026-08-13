/**
 * Payment/checkout flow module — Paymob preparation.
 *
 * This module isolates the future payment UX so the real Paymob integration
 * can plug in cleanly later. It intentionally contains NO fake behavior and NO
 * secrets: payment state is always read from the real backend
 * (lib/api/payments.ts → GET/POST /api/v1/orders/:orderId/payments).
 *
 * The eventual flow (as specified in the project docs):
 *
 *   Cart / Checkout
 *     → Create Order             (backend Checkout phase owns order creation)
 *     → Payment Initialization   (POST /orders/:orderId/payments — backend
 *                                 derives amount/currency/provider; idempotent
 *                                 via Idempotency-Key)
 *     → Paymob                   (providerCheckoutUrl rendered by the UI)
 *     → Payment Result           (Paymob redirect / iframe)
 *     → Backend Verification     (Paymob webhook → payment status)
 *     → Order Payment Status     (GET /orders/:orderId/payment)
 *     → Frontend Result
 *
 * The merchant dashboard currently surfaces the payment status and initiation
 * on the Order details page. The customer-facing storefront checkout will use
 * this module when the storefront phase lands.
 */

/** Immutable description of a payment step for the merchant UI. */
export interface PaymentFlowStep {
  orderId: string;
  orderNumber: string;
  amountMinorUnits: number;
  currency: string;
}

/**
 * Maps a backend payment status to a localized UI label key prefix.
 * Never derives payment success/failure in the frontend — the backend is
 * authoritative.
 */
export function paymentStatusLabelKey(
  status: string,
): 'status.PENDING' | 'status.PROCESSING' | 'status.SUCCEEDED' | 'status.FAILED' {
  switch (status) {
    case 'PROCESSING':
      return 'status.PROCESSING';
    case 'SUCCEEDED':
      return 'status.SUCCEEDED';
    case 'FAILED':
      return 'status.FAILED';
    default:
      return 'status.PENDING';
  }
}
