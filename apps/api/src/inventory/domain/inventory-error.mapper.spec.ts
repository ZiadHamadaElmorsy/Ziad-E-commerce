import { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../common/errors/domain-exceptions';
import { mapInventoryWriteError } from './inventory-error.mapper';

describe('inventory error mapper', () => {
  function knownRequestError(code: string): Prisma.PrismaClientKnownRequestError {
    return new Prisma.PrismaClientKnownRequestError('Database error', {
      code,
      clientVersion: '6.19.3',
    });
  }

  it('maps a unique violation (P2002) to CONFLICT', () => {
    expect(mapInventoryWriteError(knownRequestError('P2002'))).toBeInstanceOf(ConflictError);
  });

  it('maps a missing-row error (P2025) to NOT_FOUND', () => {
    expect(mapInventoryWriteError(knownRequestError('P2025'))).toBeInstanceOf(NotFoundError);
  });

  it('maps a missing-parent FK error (P2003) to NOT_FOUND', () => {
    expect(mapInventoryWriteError(knownRequestError('P2003'))).toBeInstanceOf(NotFoundError);
  });

  it('rethrows unrecognized errors untouched', () => {
    const original = new Error('boom');
    expect(mapInventoryWriteError(original)).toBe(original);
  });
});
