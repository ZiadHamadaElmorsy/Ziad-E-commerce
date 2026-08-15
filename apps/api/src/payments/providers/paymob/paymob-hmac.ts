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
 * Object fields contribute their JSON string representation (the compact JSON
 * Paymob sends); missing fields contribute an empty string. Booleans are
 * concatenated as JSON-style lowercase `true`/`false`.
 *
 * Field-order note (Phase 24 — verified against Paymob's CURRENT published
 * contract and the merchant's real account): Paymob's current documentation
 * ("Transaction Processed Callback") lists a 20-field concatenation order that
 * differs from the long-standing legacy 24-field list (error_occured vs
 * error_occurred, has_parent_transaction vs has_source_management, order.id vs
 * the whole order object, integration_id, and no is_refunded_partial /
 * refunded_amount_cents / token / transaction_id). Because both lists are
 * documented and the exact list depends on the account/region/rollout, the
 * verifier accepts a signature computed with EITHER list — both are computed
 * from the received payload with the shared HMAC secret, so this does not
 * weaken authenticity (a forger without the secret cannot compute either).
 * The matched scheme is returned for diagnostics so an operator can see which
 * contract the live account uses.
 */

/** Current Paymob concatenation order (20 fields) — Paymob docs, June 2026. */
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

/** Legacy Paymob concatenation order (24 fields) — the long-standing classic list. */
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

export type PaymobHmacScheme = 'current' | 'classic';

/** Which field list signed the callback (null = invalid signature). */
export interface PaymobHmacVerification {
  valid: boolean;
  scheme: PaymobHmacScheme | null;
}

/**
 * Verifies a Paymob transaction-process callback signature against either the
 * current documented field list or the classic list. Fails closed (valid:
 * false) for any missing input or non-matching signature.
 */
export function verifyPaymobTransactionHmac(
  obj: Record<string, unknown>,
  hmac: string,
  secret: string,
): boolean {
  return verifyPaymobTransactionHmacDetailed(obj, hmac, secret).valid;
}

/** {@link verifyPaymobTransactionHmac} + which field list matched. */
export function verifyPaymobTransactionHmacDetailed(
  obj: Record<string, unknown>,
  hmac: string,
  secret: string,
): PaymobHmacVerification {
  if (!obj || !secret || !hmac) {
    return { valid: false, scheme: null };
  }

  const expectedCurrent = computeHmac(obj, HMAC_FIELDS_CURRENT, secret);
  if (safeEqual(expectedCurrent, hmac)) {
    return { valid: true, scheme: 'current' };
  }

  const expectedClassic = computeHmac(obj, HMAC_FIELDS_CLASSIC, secret);
  if (safeEqual(expectedClassic, hmac)) {
    return { valid: true, scheme: 'classic' };
  }

  return { valid: false, scheme: null };
}

/** Computes the lowercase-hex HMAC-SHA512 over the concatenated field values. */
function computeHmac(
  obj: Record<string, unknown>,
  fields: readonly string[],
  secret: string,
): string {
  let raw = '';
  for (const field of fields) {
    raw += resolveFieldValue(obj, field);
  }
  raw += secret;
  return createHmac('sha512', secret).update(raw, 'utf8').digest('hex');
}

/** Timing-safe hex compare (normalizes case of the received value). */
function safeEqual(expected: string, received: string): boolean {
  const receivedNormalized = received.toLowerCase();
  if (expected.length !== receivedNormalized.length) {
    return false;
  }
  return timingSafeEqual(
    Buffer.from(expected, 'utf8'),
    Buffer.from(receivedNormalized, 'utf8'),
  );
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

/** Objects are signed as their JSON string; booleans as true/false; else text. */
function valueToString(value: unknown): string {
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
