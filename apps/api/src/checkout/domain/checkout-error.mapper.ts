import { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../common/errors/domain-exceptions';

/**
 * Maps Prisma write errors to the domain error taxonomy for the Checkout
 * module, mirroring the Catalog/Inventory/Customer mappers. The FINAL database
 * constraints are the last safety boundary:
 *
 *   - P2002 : a UNIQUE (store_id, order_number) or (store_id, idempotency_key)
 *             collision that the checkout flow did not resolve internally ->
 *             CONFLICT. (Order-number collisions are retried by re-running
 *             the checkout transaction; idempotency-key collisions are
 *             resolved by returning the existing order — only unexpected
 *             collisions reach this mapping.)
 *   - P2025 : a row disappeared mid-operation -> NOT_FOUND.
 *   - P2003 : a referenced parent (customer/variant) is missing -> NOT_FOUND.
 *
 * Anything unrecognized is rethrown untouched and rendered as a generic
 * INTERNAL_SERVER_ERROR by AllExceptionsFilter.
 */
export function mapCheckoutWriteError(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return new ConflictError(
        'The checkout could not be completed because of a conflicting resource.',
      );
    }
    if (error.code === 'P2025') {
      return new NotFoundError('The requested resource was not found.');
    }
    if (error.code === 'P2003') {
      return new NotFoundError('A referenced resource could not be found.');
    }
  }
  return error;
}

/** True for a Prisma UNIQUE constraint violation. */
export function isUniqueViolation(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
