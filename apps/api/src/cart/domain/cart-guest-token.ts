import { randomBytes } from 'node:crypto';

/**
 * Guest cart identity (docs/DOMAIN-MODEL.md §10.1, docs/DATABASE.md §17.2 and
 * §33 decision 9): an opaque random token that contains NO business
 * information. It is server-generated with 256 bits of entropy (base64url of
 * 32 random bytes) and is never derived from or used as an authorization
 * source — it only selects a cart inside the trusted tenant store.
 */
export const GUEST_TOKEN_BYTES = 32;

export function generateGuestToken(): string {
  return randomBytes(GUEST_TOKEN_BYTES).toString('base64url');
}
