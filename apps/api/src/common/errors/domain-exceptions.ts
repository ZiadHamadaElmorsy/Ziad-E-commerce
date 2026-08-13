import { HttpStatus } from '@nestjs/common';
import { DomainErrorCode } from './domain-error-code.enum';
import { DomainError } from './domain.error';

/**
 * Typed domain/application exceptions.
 *
 * Every exception maps to the shared API error envelope through
 * AllExceptionsFilter. HTTP statuses are chosen to be stable and reusable
 * across all future domain modules:
 *
 * | Code                      | HTTP  | Typical meaning                                    |
 * | ------------------------- | ----- | -------------------------------------------------- |
 * | NOT_FOUND                 | 404   | A requested resource does not exist                |
 * | CONFLICT                  | 409   | Resource state conflicts with the operation        |
 * | FORBIDDEN                 | 403   | Authenticated but not allowed                      |
 * | UNAUTHORIZED              | 401   | Missing / invalid / expired credentials            |
 * | VALIDATION_ERROR          | 400   | Malformed request data (also used by ValidationPipe)|
 * | BAD_REQUEST               | 400   | General client error                               |
 * | STATE_TRANSITION          | 409   | Illegal lifecycle/state-machine transition         |
 * | INSUFFICIENT_INVENTORY    | 409   | Availability check failed (oversell protection)    |
 * | IDEMPOTENCY_CONFLICT      | 409   | Duplicate/conflicting idempotency key              |
 * | TENANT_CONTEXT_REQUIRED   | 400   | Store tenant context missing/ambiguous             |
 */

export class NotFoundError extends DomainError {
  constructor(message = 'The requested resource was not found.', details?: unknown) {
    super(DomainErrorCode.NOT_FOUND, message, HttpStatus.NOT_FOUND, details);
  }
}

export class ConflictError extends DomainError {
  constructor(
    message = 'The operation conflicts with the current resource state.',
    details?: unknown,
  ) {
    super(DomainErrorCode.CONFLICT, message, HttpStatus.CONFLICT, details);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'You are not allowed to perform this action.', details?: unknown) {
    super(DomainErrorCode.FORBIDDEN, message, HttpStatus.FORBIDDEN, details);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = 'Authentication is required.', details?: unknown) {
    super(DomainErrorCode.UNAUTHORIZED, message, HttpStatus.UNAUTHORIZED, details);
  }
}

export class ValidationError extends DomainError {
  constructor(message = 'Request validation failed.', details?: unknown) {
    super(DomainErrorCode.VALIDATION_ERROR, message, HttpStatus.BAD_REQUEST, details);
  }
}

export class BadRequestError extends DomainError {
  constructor(message = 'The request is invalid.', details?: unknown) {
    super(DomainErrorCode.BAD_REQUEST, message, HttpStatus.BAD_REQUEST, details);
  }
}

export class StateTransitionError extends DomainError {
  constructor(message = 'The requested state transition is not allowed.', details?: unknown) {
    super(DomainErrorCode.STATE_TRANSITION, message, HttpStatus.CONFLICT, details);
  }
}

export class InsufficientInventoryError extends DomainError {
  constructor(message = 'Insufficient inventory available.', details?: unknown) {
    super(DomainErrorCode.INSUFFICIENT_INVENTORY, message, HttpStatus.CONFLICT, details);
  }
}

export class IdempotencyConflictError extends DomainError {
  constructor(
    message = 'A request with this idempotency key has already been processed.',
    details?: unknown,
  ) {
    super(DomainErrorCode.IDEMPOTENCY_CONFLICT, message, HttpStatus.CONFLICT, details);
  }
}

export class TenantContextRequiredError extends DomainError {
  constructor(message = 'A store tenant context is required.', details?: unknown) {
    super(DomainErrorCode.TENANT_CONTEXT_REQUIRED, message, HttpStatus.BAD_REQUEST, details);
  }
}

/**
 * Media storage failure (Media phase — Supabase Storage). The API cannot reach
 * or successfully operate on the media storage backend. Always rendered as the
 * stable STORAGE_ERROR code; the underlying cause is logged server-side and
 * never exposed to the client (credentials / internal paths never leak).
 */
export class StorageError extends DomainError {
  constructor(
    message = 'Media storage is unavailable. Please try again later.',
    details?: unknown,
  ) {
    super(DomainErrorCode.STORAGE_ERROR, message, HttpStatus.BAD_GATEWAY, details);
  }
}
