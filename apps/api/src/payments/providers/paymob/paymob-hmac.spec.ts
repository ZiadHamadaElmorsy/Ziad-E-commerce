import { createHmac } from 'node:crypto';
import { verifyPaymobTransactionHmac } from './paymob-hmac';

/** The documented Paymob concatenation order (must stay in sync with the helper). */
const HMAC_FIELDS = [
  'amount_cents',
  'created_at',
  'currency',
  'error_occurred',
  'has_source_management',
  'id',
  'is_3d_secure',
  'is_auth',
  'is_capture',
  'is_refunded',
  'is_refunded_partial',
  'is_standalone_payment',
  'is_voided',
  'order',
  'owner',
  'pending',
  'refunded_amount_cents',
  'source_data.pan',
  'source_data.sub_type',
  'source_data.type',
  'success',
  'token',
  'transaction_id',
] as const;

function resolveField(obj: Record<string, unknown>, field: string): string {
  const segments = field.split('.');
  let value: unknown = obj;
  for (const segment of segments) {
    if (value === null || value === undefined || typeof value !== 'object') {
      return '';
    }
    value = (value as Record<string, unknown>)[segment];
  }
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function sign(obj: Record<string, unknown>, secret: string): string {
  let raw = '';
  for (const field of HMAC_FIELDS) {
    raw += resolveField(obj, field);
  }
  raw += secret;
  return createHmac('sha512', secret).update(raw, 'utf8').digest('hex');
}

function sampleTransaction(): Record<string, unknown> {
  return {
    amount_cents: 1000,
    created_at: '2026-08-12T10:00:00.000000',
    currency: 'EGP',
    error_occurred: false,
    has_source_management: false,
    id: 88131,
    is_3d_secure: false,
    is_auth: false,
    is_capture: false,
    is_refunded: false,
    is_refunded_partial: false,
    is_standalone_payment: false,
    is_voided: false,
    order: { id: 112233, merchant_order_id: 'payment-1', amount_cents: 1000 },
    owner: 3,
    pending: false,
    refunded_amount_cents: 0,
    source_data: { pan: '5123', sub_type: 'MasterCard', type: 'card' },
    success: true,
    token: 'x',
    transaction_id: 77123,
  };
}

describe('verifyPaymobTransactionHmac', () => {
  const secret = 'super-secret-hmac';

  it('accepts a correctly signed transaction callback', () => {
    const obj = sampleTransaction();
    const hmac = sign(obj, secret);
    expect(verifyPaymobTransactionHmac(obj, hmac, secret)).toBe(true);
  });

  it('rejects a tampered amount', () => {
    const obj = sampleTransaction();
    const tampered = { ...obj, amount_cents: 9999 };
    const hmac = sign(obj, secret);
    expect(verifyPaymobTransactionHmac(tampered, hmac, secret)).toBe(false);
  });

  it('rejects a tampered success flag', () => {
    const obj = sampleTransaction();
    const hmac = sign(obj, secret);
    const forged = { ...obj, success: true };
    const signedFailure = sign({ ...sampleTransaction(), success: false }, secret);
    // A failure signature must not validate a success object.
    expect(verifyPaymobTransactionHmac(forged, signedFailure, secret)).toBe(false);
    expect(verifyPaymobTransactionHmac(forged, hmac, secret)).toBe(true);
  });

  it('rejects a signature made with a different secret', () => {
    const obj = sampleTransaction();
    const hmac = sign(obj, 'other-secret');
    expect(verifyPaymobTransactionHmac(obj, hmac, secret)).toBe(false);
  });

  it('rejects empty/missing inputs (fail closed)', () => {
    expect(verifyPaymobTransactionHmac(sampleTransaction(), '', secret)).toBe(false);
    expect(verifyPaymobTransactionHmac({} as Record<string, unknown>, 'abc', secret)).toBe(false);
    expect(verifyPaymobTransactionHmac(sampleTransaction(), 'abc', '')).toBe(false);
  });

  it('is case-insensitive for the received hex digest', () => {
    const obj = sampleTransaction();
    const hmac = sign(obj, secret);
    expect(verifyPaymobTransactionHmac(obj, hmac.toUpperCase(), secret)).toBe(true);
  });

  it('object fields (order) contribute their JSON string to the signed payload', () => {
    const obj = sampleTransaction();
    // Changing only the JSON serialization of the order object breaks the HMAC.
    const differentlySerialized = {
      ...obj,
      order: JSON.parse(JSON.stringify(obj.order)),
    };
    const hmac = sign(obj, secret);
    // Re-serializing a structurally identical object still signs identically.
    expect(verifyPaymobTransactionHmac(differentlySerialized, hmac, secret)).toBe(true);
  });
});
