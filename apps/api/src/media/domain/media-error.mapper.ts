import { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../common/errors/domain-exceptions';

/**
 * Maps Prisma write errors to the domain error taxonomy for the Media module.
 * The FINAL database constraints are the last safety boundary: a P2003 FK
 * violation during media deletion is the `product_media` RESTRICT backstop
 * (docs/DATABASE.md §9.2/§22.4) and surfaces as a typed CONFLICT — never as a
 * Prisma internal. P2025 (row missing) surfaces as NOT_FOUND.
 */
export function mapMediaWriteError(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2003') {
      return new ConflictError('The media asset is referenced and cannot be deleted.');
    }
    if (error.code === 'P2025') {
      return new NotFoundError('The media asset was not found.');
    }
  }
  return error;
}
