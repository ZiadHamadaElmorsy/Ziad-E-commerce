/**
 * Canonical application/domain error codes.
 *
 * These codes are rendered inside the project's API error envelope:
 *
 *   { "error": { "code", "message", "details" } }
 *
 * The AllExceptionsFilter prefers the explicit code carried by a DomainError
 * over the HTTP-status fallback mapping, so future domain modules can throw
 * rich, typed errors (state-machine violations, inventory shortages,
 * idempotency conflicts, missing tenant context, ...) without leaking
 * implementation details.
 *
 * NOTE: this list is intentionally small and reusable. It MUST NOT grow with
 * one-off codes per endpoint; new codes require a deliberate decision.
 */
export enum DomainErrorCode {
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  FORBIDDEN = 'FORBIDDEN',
  UNAUTHORIZED = 'UNAUTHORIZED',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  BAD_REQUEST = 'BAD_REQUEST',
  STATE_TRANSITION = 'STATE_TRANSITION',
  INSUFFICIENT_INVENTORY = 'INSUFFICIENT_INVENTORY',
  IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT',
  TENANT_CONTEXT_REQUIRED = 'TENANT_CONTEXT_REQUIRED',
  // External media storage (Supabase Storage) failure or unavailability.
  // Deliberate addition for the Media phase (Phase 13) — the media provider
  // fails closed (like the Supabase Auth provider) and the API must surface a
  // stable, typed STORAGE_ERROR instead of a generic internal error.
  STORAGE_ERROR = 'STORAGE_ERROR',
}
