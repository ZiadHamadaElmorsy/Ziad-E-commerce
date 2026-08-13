import { Payment, PaymentAttempt, PaymentStatus } from '@prisma/client';

/**
 * Public Payment representations returned by the merchant Payment API
 * (docs/API-SPEC.md §24) and the provider-initiated checkout flow.
 *
 * - Money is integer minor units (EGP piastres); the stored BIGINT values are
 *   converted to plain JSON-safe numbers by the mappers (docs/DATABASE.md
 *   §15.5 — no floating-point money anywhere).
 * - Internal columns (store_id, idempotency_key, raw payloads) are never
 *   exposed. Provider session tokens stay inside providerCheckoutUrl and are
 *   never persisted in this view's sibling fields.
 */

export interface PaymentAttemptView {
  id: string;
  status: PaymentStatus;
  providerReference: string | null;
  amount: number;
  currency: string;
  failureCode: string | null;
  failureMessage: string | null;
  initiatedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentView {
  id: string;
  orderId: string;
  status: PaymentStatus;
  provider: string;
  providerReference: string | null;
  amount: number;
  currency: string;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  updatedAt: string;
  attempts: PaymentAttemptView[];
  /** Provider-hosted checkout URL (Paymob iframe) — set only on a fresh initiation. */
  providerCheckoutUrl: string | null;
}

export type PaymentWithAttempts = Payment & { attempts: PaymentAttempt[] };

export function toPaymentAttemptView(attempt: PaymentAttempt): PaymentAttemptView {
  return {
    id: attempt.id,
    status: attempt.status,
    providerReference: attempt.providerReference,
    amount: Number(attempt.amount),
    currency: attempt.currency,
    failureCode: attempt.failureCode,
    failureMessage: attempt.failureMessage,
    initiatedAt: attempt.initiatedAt?.toISOString() ?? null,
    completedAt: attempt.completedAt?.toISOString() ?? null,
    createdAt: attempt.createdAt.toISOString(),
    updatedAt: attempt.updatedAt.toISOString(),
  };
}

export function toPaymentView(
  payment: PaymentWithAttempts,
  providerCheckoutUrl?: string | null,
): PaymentView {
  return {
    id: payment.id,
    orderId: payment.orderId,
    status: payment.status,
    provider: payment.provider,
    providerReference: payment.providerReference,
    amount: Number(payment.amount),
    currency: payment.currency,
    failureCode: payment.failureCode,
    failureMessage: payment.failureMessage,
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
    attempts: payment.attempts.map(toPaymentAttemptView),
    providerCheckoutUrl: providerCheckoutUrl ?? null,
  };
}
