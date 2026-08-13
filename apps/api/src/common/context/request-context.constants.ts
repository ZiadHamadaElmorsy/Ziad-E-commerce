/**
 * Request correlation header contract (docs/API-SPEC.md, section 41).
 *
 * A client/edge layer may supply an `X-Request-ID`; when present and valid it
 * is preserved, otherwise the backend generates one.
 */
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Upper bound for an accepted client-supplied request ID. Longer values are
 * rejected (a fresh ID is generated) to keep logs and audit trails bounded
 * and to prevent log-injection via oversized header values.
 */
export const MAX_REQUEST_ID_LENGTH = 128;

/**
 * Allowed character set for a client-supplied request ID (RFC 3986
 * "unreserved" plus common separators). Anything else -> generate a new ID.
 */
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9._~-]+$/;
