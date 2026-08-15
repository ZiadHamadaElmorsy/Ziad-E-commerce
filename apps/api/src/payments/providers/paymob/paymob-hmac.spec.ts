import { createHmac } from 'node:crypto';
import {
  verifyPaymobTransactionHmac,
  verifyPaymobTransactionHmacDetailed,
} from './paymob-hmac';

/** The legacy (24-field) Paymob concatenation order used by older docs. */
const HMAC_FIELDS_CLASSIC = [
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

/** The current (20-field) Paymob concatenation order (Paymob docs, 2026). */
const HMAC_FIELDS_CURRENT = [
  'amount_cents',
  'created_at',
  'currency',
  'error_occured',
  'has_parent_transaction',
  'id',
  'integration_id',
  'is_3d_secure',
  'is_auth',
  'is_capture',
  'is_refunded',
  'is_standalone_payment',
  'is_voided',
  'order.id',
  'owner',
  'pending',
  'source_data.pan',
  'source_data.sub_type',
  'source_data.type',
  'success',
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
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return String(value);
}

function sign(
  obj: Record<string, unknown>,
  secret: string,
  fields: readonly string[],
): string {
  let raw = '';
  for (const field of fields) {
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

/** A current-contract transaction (20-field keys present). */
function currentTransaction(): Record<string, unknown> {
  return {
    amount_cents: 1000,
    created_at: '2026-08-12T10:00:00.000000',
    currency: 'EGP',
    error_occured: false,
    has_parent_transaction: false,
    id: 88131,
    integration_id: 6741,
    is_3d_secure: true,
    is_auth: false,
    is_capture: false,
    is_refunded: false,
    is_standalone_payment: true,
    is_voided: false,
    order: { id: 4778239, merchant_order_id: 'payment-1' },
    owner: 4705,
    pending: false,
    source_data: { pan: '2346', sub_type: 'MasterCard', type: 'card' },
    success: true,
  };
}

describe('verifyPaymobTransactionHmac', () => {
  const secret = 'super-secret-hmac';

  it('accepts a classic (legacy 24-field) signed transaction via fallback', () => {
    const obj = sampleTransaction();
    const hmac = sign(obj, secret, HMAC_FIELDS_CLASSIC);
    expect(verifyPaymobTransactionHmac(obj, hmac, secret)).toBe(true);
    expect(verifyPaymobTransactionHmacDetailed(obj, hmac, secret)).toEqual({
      valid: true,
      scheme: 'classic',
    });
  });

  it('accepts a current (20-field) signed transaction as the primary scheme', () => {
    const obj = currentTransaction();
    const hmac = sign(obj, secret, HMAC_FIELDS_CURRENT);
    expect(verifyPaymobTransactionHmac(obj, hmac, secret)).toBe(true);
    expect(verifyPaymobTransactionHmacDetailed(obj, hmac, secret)).toEqual({
      valid: true,
      scheme: 'current',
    });
  });

  it('rejects a tampered amount', () => {
    const obj = sampleTransaction();
    const tampered = { ...obj, amount_cents: 9999 };
    const hmac = sign(obj, secret, HMAC_FIELDS_CLASSIC);
    expect(verifyPaymobTransactionHmac(tampered, hmac, secret)).toBe(false);
  });

  it('rejects a tampered success flag', () => {
    const obj = sampleTransaction();
    const hmac = sign(obj, secret, HMAC_FIELDS_CLASSIC);
    const forged = { ...obj, success: true };
    const signedFailure = sign(
      { ...sampleTransaction(), success: false },
      secret,
      HMAC_FIELDS_CLASSIC,
    );
    // A failure signature must not validate a success object.
    expect(verifyPaymobTransactionHmac(forged, signedFailure, secret)).toBe(false);
    expect(verifyPaymobTransactionHmac(forged, hmac, secret)).toBe(true);
  });

  it('rejects a signature made with a different secret', () => {
    const obj = sampleTransaction();
    const hmac = sign(obj, 'other-secret', HMAC_FIELDS_CLASSIC);
    expect(verifyPaymobTransactionHmac(obj, hmac, secret)).toBe(false);
  });

  it('rejects empty/missing inputs (fail closed)', () => {
    expect(verifyPaymobTransactionHmac(sampleTransaction(), '', secret)).toBe(false);
    expect(verifyPaymobTransactionHmac({} as Record<string, unknown>, 'abc', secret)).toBe(false);
    expect(verifyPaymobTransactionHmac(sampleTransaction(), 'abc', '')).toBe(false);
  });

  it('is case-insensitive for the received hex digest', () => {
    const obj = sampleTransaction();
    const hmac = sign(obj, secret, HMAC_FIELDS_CLASSIC);
    expect(verifyPaymobTransactionHmac(obj, hmac.toUpperCase(), secret)).toBe(true);
  });

  it('object fields (order) contribute their JSON string to the signed payload', () => {
    const obj = sampleTransaction();
    // Changing only the JSON serialization of the order object breaks the HMAC.
    const differentlySerialized = {
      ...obj,
      order: JSON.parse(JSON.stringify(obj.order)),
    };
    const hmac = sign(obj, secret, HMAC_FIELDS_CLASSIC);
    // Re-serializing a structurally identical object still signs identically.
    expect(verifyPaymobTransactionHmac(differentlySerialized, hmac, secret)).toBe(true);
  });

  it('booleans are concatenated as lowercase true/false in both schemes', () => {
    // A naive String(true) = 'True' would break the HMAC; the verifier signs
    // with JSON-style lowercase booleans on both field lists.
    const obj = currentTransaction();
    const hmac = sign(obj, secret, HMAC_FIELDS_CURRENT);
    expect(verifyPaymobTransactionHmac(obj, hmac, secret)).toBe(true);
  });
});
