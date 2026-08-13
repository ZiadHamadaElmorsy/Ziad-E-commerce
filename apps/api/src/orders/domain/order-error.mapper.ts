import { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../common/errors/domain-exceptions';

/**
 * Maps Prisma write errors to the domain error taxonomy for the Orders module,
 * mirroring the Catalog/Inventory/Customer/Checkout mappers. The FINAL database
 * constraints are the last safety boundary:
 *
 *   - P2025 : a row disappeared mid-operation -> NOT_FOUND.
 *   - P2002 : a UNIQUE constraint collision (e.g. store_id, order_number) ->
 *             CONFLICT.
 *   - P2003 : a referenced parent (customer) is missing -> NOT_FOUND.
 *
 * Anything unrecognized is rethrown untouched and rendered as a generic
 * INTERNAL_SERVER_ERROR by AllExceptionsFilter. Domain errors thrown before
 * Prisma is reached (NOT_FOUND / STATE_TRANSITION) pass through untouched.
 */
export function mapOrderWriteError(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2025') {
      return new NotFoundError('The requested resource was not found.');
    }
    if (error.code === 'P2002') {
      return new ConflictError('The order could not be updated because of a conflicting resource.');
    }
    if (error.code === 'P2003') {
      return new NotFoundError('A referenced resource could not be found.');
    }
  }
  return error;
}
