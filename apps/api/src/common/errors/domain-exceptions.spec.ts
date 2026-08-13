import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  IdempotencyConflictError,
  InsufficientInventoryError,
  NotFoundError,
  StateTransitionError,
  StorageError,
  TenantContextRequiredError,
  UnauthorizedError,
  ValidationError,
} from './domain-exceptions';
import { DomainErrorCode } from './domain-error-code.enum';
import { DomainError } from './domain.error';

describe('Domain error taxonomy', () => {
  it('maps each typed exception to its stable code and HTTP status', () => {
    const cases: Array<[DomainError, DomainErrorCode, number]> = [
      [new NotFoundError(), DomainErrorCode.NOT_FOUND, 404],
      [new ConflictError(), DomainErrorCode.CONFLICT, 409],
      [new ForbiddenError(), DomainErrorCode.FORBIDDEN, 403],
      [new UnauthorizedError(), DomainErrorCode.UNAUTHORIZED, 401],
      [new ValidationError(), DomainErrorCode.VALIDATION_ERROR, 400],
      [new BadRequestError(), DomainErrorCode.BAD_REQUEST, 400],
      [new StateTransitionError(), DomainErrorCode.STATE_TRANSITION, 409],
      [new InsufficientInventoryError(), DomainErrorCode.INSUFFICIENT_INVENTORY, 409],
      [new IdempotencyConflictError(), DomainErrorCode.IDEMPOTENCY_CONFLICT, 409],
      [new TenantContextRequiredError(), DomainErrorCode.TENANT_CONTEXT_REQUIRED, 400],
      [new StorageError(), DomainErrorCode.STORAGE_ERROR, 502],
    ];

    for (const [error, code, status] of cases) {
      expect(error.code).toBe(code);
      expect(error.getStatus()).toBe(status);
    }
  });

  it('carries the provided message and details', () => {
    const error = new NotFoundError('Product not found.', { productId: 'p-1' });
    expect(error.message).toContain('Product not found');
    expect(error.details).toEqual({ productId: 'p-1' });
  });
});
