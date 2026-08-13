import { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../common/errors/domain-exceptions';
import { mapCustomerWriteError } from './customer-error.mapper';

describe('mapCustomerWriteError', () => {
  it('maps P2002 with a known target to a CONFLICT error with the mapped message', () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '6.19.3',
      meta: { target: ['storeId', 'email'] },
    });

    const result = mapCustomerWriteError(prismaError, {
      'store_id,email': 'A customer with this email already exists in this store.',
    });

    expect(result).toBeInstanceOf(ConflictError);
    expect((result as ConflictError).message).toBe(
      'A customer with this email already exists in this store.',
    );
  });

  it('maps P2002 with an unknown target to a generic CONFLICT error', () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '6.19.3',
      meta: { target: ['storeId', 'phone'] },
    });

    const result = mapCustomerWriteError(prismaError, {});

    expect(result).toBeInstanceOf(ConflictError);
    expect((result as ConflictError).message).toBe(
      'The operation conflicts with the current resource state.',
    );
  });

  it('maps P2025 to NOT_FOUND', () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: '6.19.3',
    });

    const result = mapCustomerWriteError(prismaError, {});

    expect(result).toBeInstanceOf(NotFoundError);
  });

  it('maps P2003 (missing parent reference) to NOT_FOUND', () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
      code: 'P2003',
      clientVersion: '6.19.3',
    });

    const result = mapCustomerWriteError(prismaError, {});

    expect(result).toBeInstanceOf(NotFoundError);
    expect((result as NotFoundError).message).toBe('A referenced resource could not be found.');
  });

  it('rethrows unrecognized errors untouched (AllExceptionsFilter renders them generic)', () => {
    const error = new Error('boom');

    expect(mapCustomerWriteError(error, {})).toBe(error);
  });
});
