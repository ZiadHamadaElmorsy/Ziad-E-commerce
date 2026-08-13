import { api } from './client';
import type { Envelope, PaymentView } from './types';

/**
 * Payment API — the REAL endpoints defined by docs/API-SPEC.md §24:
 *
 *   POST /api/v1/orders/:orderId/payments   Create Payment Attempt
 *   GET  /api/v1/orders/:orderId/payment    Get Payment
 *
 * The backend derives the store, order, amount, currency and provider
 * server-side — client-supplied totals/statuses are never trusted. The
 * Idempotency-Key header is REQUIRED for payment initiation (critical write).
 *
 * This module is the frontend half of the future Paymob flow
 * (Cart/Checkout → Create Order → Payment Initialization → Paymob →
 * Payment Result → Backend Verification/Webhook → Order Payment Status).
 * The backend already implements payment creation + the Paymob webhook, so the
 * UI can call these endpoints directly; no Paymob secrets ever reach this
 * frontend.
 */
export const paymentsApi = {
  /** GET /orders/:orderId/payment — current payment state for an order. */
  getPayment: (orderId: string) => api.get<Envelope<PaymentView>>(`/orders/${orderId}/payment`),

  /**
   * POST /orders/:orderId/payments — initiate a payment attempt.
   * `idempotencyKey` must be unique per initiation attempt.
   */
  createPayment: (orderId: string, idempotencyKey: string) =>
    api.post<Envelope<PaymentView>>(`/orders/${orderId}/payments`, undefined, {
      'Idempotency-Key': idempotencyKey,
    }),
};

/** Generates a fresh RFC-4122 idempotency key for payment initiation. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
