import { ForbiddenError, TenantContextRequiredError } from '../common/errors/domain-exceptions';
import type { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from './tenant-context.service';

describe('TenantContextService', () => {
  let prisma: { storeMembership: { findMany: jest.Mock } };
  let service: TenantContextService;

  function membership(
    id: string,
    storeId: string,
    role: 'OWNER' | 'ADMIN' | 'STAFF',
    store: { id: string; slug: string; name: string; status: 'ACTIVE' },
  ) {
    return {
      id,
      storeId,
      role,
      status: 'ACTIVE',
      store,
    };
  }

  beforeEach(() => {
    prisma = { storeMembership: { findMany: jest.fn() } };
    service = new TenantContextService(prisma as unknown as PrismaService);
  });

  it('resolves the single ACTIVE membership without a candidate store', async () => {
    prisma.storeMembership.findMany.mockResolvedValue([
      membership('m-1', 'store-1', 'OWNER', {
        id: 'store-1',
        slug: 'my-store',
        name: 'My Store',
        status: 'ACTIVE',
      }),
    ]);

    const tenant = await service.resolveForUser('auth-1');

    expect(prisma.storeMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'ACTIVE', user: { authUserId: 'auth-1' } },
      }),
    );
    expect(tenant.membership).toEqual({
      id: 'm-1',
      storeId: 'store-1',
      role: 'OWNER',
      status: 'ACTIVE',
    });
    expect(tenant.store).toEqual({
      id: 'store-1',
      slug: 'my-store',
      name: 'My Store',
      status: 'ACTIVE',
    });
  });

  it('uses the candidate store id only as a lookup key into the ACTIVE memberships', async () => {
    prisma.storeMembership.findMany.mockResolvedValue([
      membership('m-1', 'store-1', 'OWNER', {
        id: 'store-1',
        slug: 'my-store',
        name: 'My Store',
        status: 'ACTIVE',
      }),
      membership('m-2', 'store-2', 'ADMIN', {
        id: 'store-2',
        slug: 'other-store',
        name: 'Other Store',
        status: 'ACTIVE',
      }),
    ]);

    const tenant = await service.resolveForUser('auth-1', 'store-2');

    expect(tenant.membership.storeId).toBe('store-2');
    expect(tenant.store.slug).toBe('other-store');
  });

  it('rejects a candidate store the user has no ACTIVE membership in (cross-store)', async () => {
    prisma.storeMembership.findMany.mockResolvedValue([
      membership('m-1', 'store-1', 'OWNER', {
        id: 'store-1',
        slug: 'my-store',
        name: 'My Store',
        status: 'ACTIVE',
      }),
    ]);

    await expect(service.resolveForUser('auth-1', 'store-999')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('rejects an authenticated user without any ACTIVE membership', async () => {
    prisma.storeMembership.findMany.mockResolvedValue([]);

    await expect(service.resolveForUser('auth-1')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('only ever queries ACTIVE memberships (inactive can never be resolved)', async () => {
    // A real database returns only ACTIVE rows because of the where filter;
    // simulate that Prisma behavior with an empty result for inactive users.
    prisma.storeMembership.findMany.mockResolvedValue([]);

    await expect(service.resolveForUser('auth-1', 'store-1')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(prisma.storeMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'ACTIVE' }),
      }),
    );
  });

  it('requires an explicit store when the user has multiple ACTIVE memberships', async () => {
    prisma.storeMembership.findMany.mockResolvedValue([
      membership('m-1', 'store-1', 'OWNER', {
        id: 'store-1',
        slug: 'my-store',
        name: 'My Store',
        status: 'ACTIVE',
      }),
      membership('m-2', 'store-2', 'STAFF', {
        id: 'store-2',
        slug: 'other-store',
        name: 'Other Store',
        status: 'ACTIVE',
      }),
    ]);

    await expect(service.resolveForUser('auth-1')).rejects.toBeInstanceOf(
      TenantContextRequiredError,
    );
  });

  it('resolves the store from the membership, never from client input', async () => {
    prisma.storeMembership.findMany.mockResolvedValue([
      membership('m-1', 'store-1', 'OWNER', {
        id: 'store-1',
        slug: 'my-store',
        name: 'My Store',
        status: 'ACTIVE',
      }),
    ]);

    // A forged client store id is only a lookup key; the resolved store is the
    // membership's store. A mismatch throws instead of trusting the client.
    await expect(service.resolveForUser('auth-1', 'forged-store')).rejects.toBeInstanceOf(
      ForbiddenError,
    );

    const tenant = await service.resolveForUser('auth-1', 'store-1');
    expect(tenant.store.id).toBe('store-1');
  });
});
