import { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../common/errors/domain-exceptions';
import { mapCartWriteError } from './cart-error.mapper';

function knownError(
  code: string,
  meta?: Record<string, unknown>,
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('boom', {
    code,
    clientVersion: 'test',
    meta,
  });
}

describe('mapCartWriteError', () => {
  it('maps P2002 (UNIQUE cart_id, variant_id race) to CONFLICT', () => {
    const mapped = mapCartWriteError(knownError('P2002'));
    expect(mapped).toBeInstanceOf(ConflictError);
  });

  it('maps P2025 (row disappeared) to NOT_FOUND', () => {
    const mapped = mapCartWriteError(knownError('P2025'));
    expect(mapped).toBeInstanceOf(NotFoundError);
  });

  it('maps P2003 (missing parent cart/variant) to NOT_FOUND', () => {
    const mapped = mapCartWriteError(knownError('P2003'));
    expect(mapped).toBeInstanceOf(NotFoundError);
  });

  it('rethrows unknown errors untouched', () => {
    const error = new Error('internal');
    expect(mapCartWriteError(error)).toBe(error);
  });
});
