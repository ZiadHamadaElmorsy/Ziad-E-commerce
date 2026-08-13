import { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../common/errors/domain-exceptions';
import { isUniqueViolation, mapCheckoutWriteError } from './checkout-error.mapper';

describe('checkout error mapper', () => {
  function knownRequestError(code: string): Prisma.PrismaClientKnownRequestError {
    return new Prisma.PrismaClientKnownRequestError('Database error', {
      code,
      clientVersion: '6.19.3',
    });
  }

  it('maps a unique violation (P2002) to CONFLICT', () => {
    expect(mapCheckoutWriteError(knownRequestError('P2002'))).toBeInstanceOf(ConflictError);
  });

  it('maps a missing-row error (P2025) to NOT_FOUND', () => {
    expect(mapCheckoutWriteError(knownRequestError('P2025'))).toBeInstanceOf(NotFoundError);
  });

  it('maps a missing-parent FK error (P2003) to NOT_FOUND', () => {
    expect(mapCheckoutWriteError(knownRequestError('P2003'))).toBeInstanceOf(NotFoundError);
  });

  it('rethrows unrecognized errors untouched', () => {
    const original = new Error('boom');
    expect(mapCheckoutWriteError(original)).toBe(original);
  });

  it('rethrows domain errors untouched (checkout reuses the shared taxonomy)', () => {
    const conflict = new ConflictError('nope');
    expect(mapCheckoutWriteError(conflict)).toBe(conflict);
  });

  it('isUniqueViolation is true only for Prisma P2002', () => {
    expect(isUniqueViolation(knownRequestError('P2002'))).toBe(true);
    expect(isUniqueViolation(knownRequestError('P2025'))).toBe(false);
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
  });
});
