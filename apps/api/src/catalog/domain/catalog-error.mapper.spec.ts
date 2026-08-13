import { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../common/errors/domain-exceptions';
import { mapCatalogWriteError } from './catalog-error.mapper';

describe('catalog error mapper', () => {
  const messages = { 'store_id,sku': 'A variant with this SKU already exists in this store.' };

  function knownRequestError(
    code: string,
    meta?: Record<string, unknown>,
  ): Prisma.PrismaClientKnownRequestError {
    return new Prisma.PrismaClientKnownRequestError('Database error', {
      code,
      clientVersion: '6.19.3',
      meta,
    });
  }

  it('maps a store-scoped unique violation (P2002) to CONFLICT with the target message', () => {
    const error = mapCatalogWriteError(
      knownRequestError('P2002', { target: ['store_id', 'sku'] }),
      messages,
    );
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).message).toBe(
      'A variant with this SKU already exists in this store.',
    );
  });

  it('normalizes camelCase field names in P2002 targets (Prisma version differences)', () => {
    const error = mapCatalogWriteError(
      knownRequestError('P2002', { target: ['storeId', 'sku'] }),
      messages,
    );
    expect((error as ConflictError).message).toBe(
      'A variant with this SKU already exists in this store.',
    );
  });

  it('falls back to a generic CONFLICT message for unknown unique targets', () => {
    const error = mapCatalogWriteError(knownRequestError('P2002', { target: ['x'] }), messages);
    expect(error).toBeInstanceOf(ConflictError);
  });

  it('maps a missing-row error (P2025) to NOT_FOUND', () => {
    expect(mapCatalogWriteError(knownRequestError('P2025'), messages)).toBeInstanceOf(
      NotFoundError,
    );
  });

  it('maps a missing-parent FK error (P2003) to NOT_FOUND', () => {
    expect(mapCatalogWriteError(knownRequestError('P2003'), messages)).toBeInstanceOf(
      NotFoundError,
    );
  });

  it('rethrows unrecognized errors untouched', () => {
    const original = new Error('boom');
    expect(mapCatalogWriteError(original, messages)).toBe(original);
  });
});
