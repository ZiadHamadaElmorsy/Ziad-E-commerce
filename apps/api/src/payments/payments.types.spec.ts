import { PaymentStatus } from '@prisma/client';
import { toPaymentAttemptView, toPaymentView } from './payments.types';

describe('payments.types', () => {
  const attempt = {
    id: 'attempt-1',
    paymentId: 'payment-1',
    status: PaymentStatus.PROCESSING,
    providerReference: 'pm-order-1',
    idempotencyKey: 'key-1',
    amount: 1000n,
    currency: 'EGP',
    failureCode: null,
    failureMessage: null,
    initiatedAt: new Date('2026-08-12T00:00:00Z'),
    completedAt: null,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const payment = {
    id: 'payment-1',
    storeId: 'store-1',
    orderId: 'order-1',
    status: PaymentStatus.SUCCEEDED,
    provider: 'paymob',
    providerReference: 'pm-order-1',
    amount: 1000n,
    currency: 'EGP',
    idempotencyKey: 'key-1',
    failureCode: null,
    failureMessage: null,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  it('converts BIGINT money to JSON-safe numbers (no floating point)', () => {
    const view = toPaymentAttemptView(attempt);
    expect(view.amount).toBe(1000);
    expect(view.currency).toBe('EGP');
    expect(view.initiatedAt).toBe('2026-08-12T00:00:00.000Z');
    expect(view.completedAt).toBeNull();
  });

  it('toPaymentView never exposes internal columns and includes attempts', () => {
    const view = toPaymentView({ ...payment, attempts: [attempt] }, 'https://iframe?token=x');
    expect(view.id).toBe('payment-1');
    expect(view.amount).toBe(1000);
    expect(view.providerCheckoutUrl).toBe('https://iframe?token=x');
    expect(view.attempts).toHaveLength(1);
    // Internal columns are never exposed.
    expect(view).not.toHaveProperty('storeId');
    expect(view).not.toHaveProperty('idempotencyKey');
  });

  it('providerCheckoutUrl defaults to null', () => {
    const view = toPaymentView({ ...payment, attempts: [] });
    expect(view.providerCheckoutUrl).toBeNull();
  });
});
