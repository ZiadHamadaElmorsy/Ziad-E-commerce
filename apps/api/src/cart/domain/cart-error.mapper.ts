import { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../common/errors/domain-exceptions';

/**
 * Maps Prisma write errors to the domain error taxonomy for the Cart module,
 * mirroring the Catalog/Inventory/Customer mappers. The FINAL database
 * constraints are the last safety boundary:
 *
 *   - P2002 : UNIQUE (cart_id, variant_id) — a concurrent duplicate add raced
 *             the merge; fail closed with CONFLICT (never a Prisma internal).
 *   - P2025 : a row disappeared mid-operation -> NOT_FOUND.
 *   - P2003 : a referenced parent (cart/variant) is missing -> NOT_FOUND.
 *
 * Anything unrecognized is rethrown untouched and rendered as a generic
 * INTERNAL_SERVER_ERROR by AllExceptionsFilter.
 */
export function mapCartWriteError(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return new ConflictError(
        'The cart already contains this variant; the request could not be applied.',
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
