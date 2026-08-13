import { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../common/errors/domain-exceptions';
import { mapMediaWriteError } from './media-error.mapper';

describe('mapMediaWriteError (media module)', () => {
  it('maps a P2003 FK violation (product_media RESTRICT backstop) to CONFLICT', () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError('FK failed', {
      code: 'P2003',
      clientVersion: '6.19.3',
    });
    const mapped = mapMediaWriteError(prismaError);
    expect(mapped).toBeInstanceOf(ConflictError);
  });

  it('maps P2025 (row missing) to NOT_FOUND', () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: '6.19.3',
    });
    expect(mapMediaWriteError(prismaError)).toBeInstanceOf(NotFoundError);
  });

  it('rethrows unrecognized errors untouched (filter renders INTERNAL_SERVER_ERROR)', () => {
    const error = new Error('boom');
    expect(mapMediaWriteError(error)).toBe(error);
  });

  it('rethrows domain errors untouched', () => {
    const error = new ConflictError('already raised');
    expect(mapMediaWriteError(error)).toBe(error);
  });
});
