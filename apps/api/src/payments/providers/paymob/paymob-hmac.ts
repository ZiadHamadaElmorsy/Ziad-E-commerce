import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Paymob transaction-process callback HMAC verification.
 *
 * Paymob signs every transaction-process webhook with an HMAC-SHA512 computed
 * over the concatenation of the values of the transaction object fields below
 * (in this exact order), followed by the HMAC secret:
 *
 *   hmac = HMAC_SHA512(secret, concat(values) + secret)
 *
 * Object fields (order, owner) contribute their JSON string representation
 * (the compact JSON Paymob sends); missing fields contribute an empty string.
 *
 * The exact Paymob verification mechanism is listed as an open decision in
 * docs/API-SPEC.md §46; this implementation follows Paymob's published
 * Accept transaction-process callback algorithm and is isolated here so the
 * business layer never depends on provider specifics. When a live Paymob
 * account is available, the field list/serialization MUST be verified against
 * a real callback before production.
 */

/** Concatenation order of the transaction fields Paymob signs (as documented). */
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

/**
 * Verifies a Paymob transaction-process callback signature.
 *
 * @param obj    the transaction object (`obj` field of the callback payload)
 * @param hmac   the `hmac` value received with the callback
 * @param secret the configured HMAC secret (PAYMOB_HMAC_SECRET)
 */
export function verifyPaymobTransactionHmac(
  obj: Record<string, unknown>,
  hmac: string,
  secret: string,
): boolean {
  if (!obj || !secret || !hmac) {
    return false;
  }

  let raw = '';
  for (const field of HMAC_FIELDS) {
    raw += resolveFieldValue(obj, field);
  }
  raw += secret;

  const expected = createHmac('sha512', secret).update(raw, 'utf8').digest('hex');
  const received = hmac.toLowerCase();

  if (expected.length !== received.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(received, 'utf8'));
}

/** Resolves a (possibly dotted) field and renders its signed value. */
function resolveFieldValue(obj: Record<string, unknown>, field: string): string {
  const segments = field.split('.');
  let value: unknown = obj;

  for (const segment of segments) {
    if (value === null || value === undefined || typeof value !== 'object') {
      return '';
    }
    value = (value as Record<string, unknown>)[segment];
  }

  return valueToString(value);
}

/** Objects are signed as their JSON string; everything else as its text form. */
function valueToString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}
