import { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../common/errors/domain-exceptions';
import { mapOrderWriteError } from './order-error.mapper';

describe('mapOrderWriteError', () => {
  it('maps P2025 (row disappeared) to NOT_FOUND', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Row missing', {
      code: 'P2025',
      clientVersion: 'test',
    });
    expect(mapOrderWriteError(error)).toBeInstanceOf(NotFoundError);
  });

  it('maps P2002 (unique collision) to CONFLICT', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique failed', {
      code: 'P2002',
      clientVersion: 'test',
    });
    expect(mapOrderWriteError(error)).toBeInstanceOf(ConflictError);
  });

  it('maps P2003 (missing referenced parent) to NOT_FOUND', () => {
    const error = new Prisma.PrismaClientKnownRequestError('FK failed', {
      code: 'P2003',
      clientVersion: 'test',
    });
    expect(mapOrderWriteError(error)).toBeInstanceOf(NotFoundError);
  });

  it('rethrows unrecognized errors untouched', () => {
    const error = new Error('boom');
    expect(mapOrderWriteError(error)).toBe(error);
  });

  it('rethrows domain errors untouched', () => {
    const error = new NotFoundError('The order was not found.');
    expect(mapOrderWriteError(error)).toBe(error);
  });
});
