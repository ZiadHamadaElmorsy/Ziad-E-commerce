import { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../common/errors/domain-exceptions';

/**
 * Maps Prisma write errors to the domain error taxonomy for the Customer
 * module, mirroring the Catalog mapper. The FINAL database constraints are the
 * last safety boundary, so unique violations (P2002 — e.g. the store-scoped
 * UNIQUE (store_id, email)), missing rows (P2025) and missing parent
 * references (P2003 — e.g. an address referencing a customer outside the
 * store) surface as typed domain errors — never as Prisma internals. Anything
 * unrecognized is rethrown untouched and rendered as a generic
 * INTERNAL_SERVER_ERROR by AllExceptionsFilter.
 */
export function mapCustomerWriteError(
  error: unknown,
  messagesByTarget: Record<string, string>,
): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const rawTarget = error.meta?.target;
      const joined = Array.isArray(rawTarget) ? rawTarget.join(',') : String(rawTarget ?? '');
      // Prisma reports unique-index targets using the DATABASE column names
      // (e.g. `store_id,email`). Normalize any camelCase field names to the
      // same snake_case form so the message maps stay stable.
      const target = joined.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
      const message =
        messagesByTarget[target] ?? 'The operation conflicts with the current resource state.';
      return new ConflictError(message);
    }
    if (error.code === 'P2025') {
      return new NotFoundError('The requested resource was not found.');
    }
    if (error.code === 'P2003') {
      // Composite store-scoped FK violation: the referenced parent does not
      // exist in this store (customer/store vanished mid-request).
      return new NotFoundError('A referenced resource could not be found.');
    }
  }
  return error;
}
