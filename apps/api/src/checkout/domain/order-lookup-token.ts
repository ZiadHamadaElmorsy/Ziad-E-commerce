import { randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Per-order secure lookup token (Phase 23 — public order confirmation
 * security). The token gates access to customer PII through the PUBLIC
 * storefront order endpoint (`GET /storefront/orders/:orderId`).
 *
 * - Generated with 24 bytes of CSPRNG output -> 48 lowercase hex chars
 *   (192 bits of entropy). It is NEVER part of the order number, is never
 *   sent to the payment provider, and is only ever returned to the party that
 *   created the order (checkout / WhatsApp responses).
 * - Comparison uses `crypto.timingSafeEqual` so a timing side-channel can
 *   never leak a prefix of the stored token.
 */
export function generateOrderLookupToken(): string {
  return randomBytes(24).toString('hex');
}

/**
 * Constant-time token comparison. Returns false for any length mismatch or
 * when the stored token is missing (a legacy order without a token can never
 * be "verified").
 */
export function isValidOrderLookupToken(candidate: string, stored: string | null): boolean {
  if (!stored || typeof candidate !== 'string' || candidate.length === 0) {
    return false;
  }
  if (candidate.length !== stored.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(stored));
}
