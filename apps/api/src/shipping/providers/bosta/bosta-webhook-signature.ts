import { createHmac, timingSafeEqual } from 'node:crypto';

/** Webhook signature header sent by Bosta delivery notifications. */
export const BOSTA_SIGNATURE_HEADER = 'x-bosta-signature';

/**
 * Bosta webhook HMAC-SHA256 verification (Phase 27 — Part 15).
 *
 * The signature is an HMAC-SHA256 over the RAW request body with the
 * dashboard webhook secret, sent as a lowercase-hex value in the
 * `X-Bosta-Signature` header. Verification fails closed for missing secret,
 * missing/empty signature, or non-matching digest. The exact signing contract
 * MUST be confirmed against the merchant's Bosta dashboard; this helper is
 * isolated so a different scheme can be swapped without touching the webhook
 * service.
 */
export function verifyBostaWebhookSignature(
  rawBody: string,
  signature: string | undefined,
  secret: string | undefined,
): boolean {
  const trimmedSecret = secret?.trim();
  const trimmedSignature = signature?.trim();
  if (!trimmedSecret || !trimmedSignature || !rawBody) {
    return false;
  }

  const expected = createHmac('sha256', trimmedSecret).update(rawBody, 'utf8').digest('hex');
  const received = trimmedSignature.toLowerCase();
  if (expected.length !== received.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(received, 'utf8'));
}
