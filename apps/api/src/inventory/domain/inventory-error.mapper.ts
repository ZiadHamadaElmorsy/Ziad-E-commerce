import { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../common/errors/domain-exceptions';

/**
 * Maps Prisma write errors to the domain error taxonomy for the Inventory
 * module, mirroring the Catalog mapper. The FINAL database constraints are the
 * last safety boundary, so unique violations (P2002 — e.g. the concurrent
 * initial-stock creation race), missing rows (P2025) and missing parent
 * references (P2003) surface as typed domain errors — never as Prisma
 * internals. Anything unrecognized is rethrown untouched and rendered as a
 * generic INTERNAL_SERVER_ERROR by AllExceptionsFilter.
 */
export function mapInventoryWriteError(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return new ConflictError('The operation conflicts with the current resource state.');
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
