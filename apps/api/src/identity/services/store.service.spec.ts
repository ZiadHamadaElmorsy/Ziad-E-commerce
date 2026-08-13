import { Prisma } from '@prisma/client';
import { RequestContextService } from '../../common/context/request-context.service';
import {
  ConflictError,
  NotFoundError,
  TenantContextRequiredError,
  UnauthorizedError,
  ValidationError,
} from '../../common/errors/domain-exceptions';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { SubscriptionService } from '../../subscription/services/subscription.service';
import { CreateStoreDto } from '../dto/create-store.dto';
import { UpdateStoreDto } from '../dto/update-store.dto';
import { StoreMembershipRepository } from '../repositories/store-membership.repository';
import { StoreRepository } from '../repositories/store.repository';
import { UserRepository } from '../repositories/user.repository';
import { StoreService } from './store.service';

describe('StoreService', () => {
  let requestContext: { getCurrent: jest.Mock };
  let users: { findByAuthUserId: jest.Mock };
  let stores: { create: jest.Mock; findById: jest.Mock; update: jest.Mock };
  let memberships: { create: jest.Mock };
  let transaction: { run: jest.Mock; runWithTenant: jest.Mock };
  let subscriptions: { startTrial: jest.Mock };
  let service: StoreService;

  const storeRow = {
    id: 'store-1',
    name: 'My Store',
    slug: 'my-store',
    description: null,
    status: 'ACTIVE',
    currency: 'EGP',
    timezone: 'Africa/Cairo',
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const userRow = {
    id: 'user-1',
    authUserId: 'auth-1',
    firstName: 'Ziad',
    lastName: 'Owner',
    email: 'owner@example.com',
    phone: null,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  beforeEach(() => {
    requestContext = { getCurrent: jest.fn() };
    users = { findByAuthUserId: jest.fn() };
    stores = { create: jest.fn(), findById: jest.fn(), update: jest.fn() };
    memberships = { create: jest.fn() };
    transaction = { run: jest.fn(), runWithTenant: jest.fn() };
    subscriptions = { startTrial: jest.fn().mockResolvedValue(undefined) };

    // The transaction helper runs the provided work with a fake tx client.
    transaction.run.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => work({}));
    transaction.runWithTenant.mockImplementation(
      async (_storeId: string, work: (tx: unknown) => Promise<unknown>) => work({}),
    );

    service = new StoreService(
      requestContext as unknown as RequestContextService,
      users as unknown as UserRepository,
      stores as unknown as StoreRepository,
      memberships as unknown as StoreMembershipRepository,
      transaction as unknown as TransactionService,
      subscriptions as unknown as SubscriptionService,
    );
  });

  function storeDto(overrides: Partial<CreateStoreDto> = {}): CreateStoreDto {
    return { name: 'My Store', slug: 'my-store', currency: 'EGP', ...overrides };
  }

  describe('createStore', () => {
    it('creates the Store, exactly one ACTIVE OWNER membership and the TRIAL subscription in a single transaction', async () => {
      requestContext.getCurrent.mockReturnValue({
        requestId: 'req-1',
        user: { authUserId: 'auth-1', email: 'owner@example.com' },
      });
      users.findByAuthUserId.mockResolvedValue(userRow);
      stores.create.mockResolvedValue(storeRow);
      memberships.create.mockResolvedValue({ id: 'm-1', storeId: 'store-1', userId: 'user-1' });

      const result = await service.createStore(storeDto());

      expect(users.findByAuthUserId).toHaveBeenCalledWith('auth-1');
      expect(transaction.run).toHaveBeenCalledTimes(1);
      expect(stores.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ name: 'My Store', slug: 'my-store', currency: 'EGP' }),
      );
      expect(memberships.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          storeId: 'store-1',
          userId: 'user-1',
          role: 'OWNER',
          status: 'ACTIVE',
        }),
      );
      // US-SUB-001: the trial subscription is created atomically with the Store.
      expect(subscriptions.startTrial).toHaveBeenCalledWith(expect.anything(), 'store-1');
      expect(result).toEqual({
        id: 'store-1',
        name: 'My Store',
        slug: 'my-store',
        description: null,
        status: 'ACTIVE',
        currency: 'EGP',
        timezone: 'Africa/Cairo',
      });
    });

    it('fails with UNAUTHORIZED when no authenticated user is present', async () => {
      requestContext.getCurrent.mockReturnValue({ requestId: 'req-1' });

      await expect(service.createStore(storeDto())).rejects.toBeInstanceOf(UnauthorizedError);
      expect(users.findByAuthUserId).not.toHaveBeenCalled();
    });

    it('fails with NOT_FOUND when the auth identity has no application User row', async () => {
      requestContext.getCurrent.mockReturnValue({
        requestId: 'req-1',
        user: { authUserId: 'unknown-auth', email: 'ghost@example.com' },
      });
      users.findByAuthUserId.mockResolvedValue(null);

      await expect(service.createStore(storeDto())).rejects.toBeInstanceOf(NotFoundError);
      expect(transaction.run).not.toHaveBeenCalled();
    });

    it('fails with VALIDATION_ERROR for an invalid slug before any write', async () => {
      requestContext.getCurrent.mockReturnValue({
        requestId: 'req-1',
        user: { authUserId: 'auth-1', email: 'owner@example.com' },
      });
      users.findByAuthUserId.mockResolvedValue(userRow);

      await expect(service.createStore(storeDto({ slug: 'My Store!' }))).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(transaction.run).not.toHaveBeenCalled();
    });
    it('rolls back the whole transaction when OWNER membership creation fails', async () => {
      requestContext.getCurrent.mockReturnValue({
        requestId: 'req-1',
        user: { authUserId: 'auth-1', email: 'owner@example.com' },
      });
      users.findByAuthUserId.mockResolvedValue(userRow);
      stores.create.mockResolvedValue(storeRow);
      memberships.create.mockRejectedValue(new Error('membership insert failed'));

      // The atomic boundary means: when membership creation fails, the
      // transaction work rejects and nothing is returned (the trial
      // subscription is never created). The real DB rollback is verified by
      // the BLOCKED integration tests.
      await expect(service.createStore(storeDto())).rejects.toThrow('membership insert failed');
      expect(subscriptions.startTrial).not.toHaveBeenCalled();
    });

    it('maps a slug unique-constraint violation (P2002) to CONFLICT', async () => {
      requestContext.getCurrent.mockReturnValue({
        requestId: 'req-1',
        user: { authUserId: 'auth-1', email: 'owner@example.com' },
      });
      users.findByAuthUserId.mockResolvedValue(userRow);
      stores.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.19.3',
        }),
      );

      await expect(service.createStore(storeDto({ slug: 'taken-slug' }))).rejects.toBeInstanceOf(
        ConflictError,
      );
      expect(memberships.create).not.toHaveBeenCalled();
      expect(subscriptions.startTrial).not.toHaveBeenCalled();
    });

    it('normalizes the slug and uppercases the currency before persisting', async () => {
      requestContext.getCurrent.mockReturnValue({
        requestId: 'req-1',
        user: { authUserId: 'auth-1', email: 'owner@example.com' },
      });
      users.findByAuthUserId.mockResolvedValue(userRow);
      stores.create.mockResolvedValue(storeRow);
      memberships.create.mockResolvedValue({ id: 'm-1' });

      await service.createStore(storeDto({ slug: '  My-Store  ', currency: 'egp' }));

      expect(stores.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ slug: 'my-store', currency: 'EGP' }),
      );
    });
  });

  describe('getCurrentStore', () => {
    it('resolves the store from the trusted tenant context', async () => {
      requestContext.getCurrent.mockReturnValue({
        requestId: 'req-1',
        store: { id: 'store-1', slug: 'my-store', name: 'My Store', status: 'ACTIVE' },
      });
      stores.findById.mockResolvedValue(storeRow);

      const result = await service.getCurrentStore();

      expect(stores.findById).toHaveBeenCalledWith('store-1');
      expect(result.id).toBe('store-1');
    });

    it('fails with TENANT_CONTEXT_REQUIRED when no tenant context is present', async () => {
      requestContext.getCurrent.mockReturnValue({ requestId: 'req-1' });

      await expect(service.getCurrentStore()).rejects.toBeInstanceOf(TenantContextRequiredError);
      expect(stores.findById).not.toHaveBeenCalled();
    });

    it('fails with NOT_FOUND when the trusted store no longer exists', async () => {
      requestContext.getCurrent.mockReturnValue({
        requestId: 'req-1',
        store: { id: 'store-1' },
      });
      stores.findById.mockResolvedValue(null);

      await expect(service.getCurrentStore()).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('updateCurrentStore', () => {
    const updateDto = (): UpdateStoreDto => ({ name: 'Updated Store' });

    it('updates the store resolved from the trusted tenant context', async () => {
      requestContext.getCurrent.mockReturnValue({
        requestId: 'req-1',
        store: { id: 'store-1' },
      });
      stores.update.mockResolvedValue({ ...storeRow, name: 'Updated Store' });

      const result = await service.updateCurrentStore(updateDto());

      expect(transaction.runWithTenant).toHaveBeenCalledWith('store-1', expect.any(Function));
      expect(stores.update).toHaveBeenCalledWith(expect.anything(), 'store-1', {
        name: 'Updated Store',
      });
      expect(result.name).toBe('Updated Store');
    });

    it('never lets the client choose the target store (cross-tenant prevention)', async () => {
      requestContext.getCurrent.mockReturnValue({
        requestId: 'req-1',
        store: { id: 'store-1' },
      });
      stores.update.mockResolvedValue(storeRow);

      // The DTO has no storeId field at all; even if a body smuggled one in
      // it could never reach this call because ValidationPipe whitelists it.
      await service.updateCurrentStore(updateDto());

      expect(transaction.runWithTenant).toHaveBeenCalledWith('store-1', expect.any(Function));
      expect(stores.update).toHaveBeenCalledWith(expect.anything(), 'store-1', expect.any(Object));
    });

    it('fails with TENANT_CONTEXT_REQUIRED when no tenant context is present', async () => {
      requestContext.getCurrent.mockReturnValue({ requestId: 'req-1' });

      await expect(service.updateCurrentStore(updateDto())).rejects.toBeInstanceOf(
        TenantContextRequiredError,
      );
      expect(transaction.runWithTenant).not.toHaveBeenCalled();
    });

    it('maps a missing-row update (P2025) to NOT_FOUND', async () => {
      requestContext.getCurrent.mockReturnValue({
        requestId: 'req-1',
        store: { id: 'store-1' },
      });
      stores.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: '6.19.3',
        }),
      );

      await expect(service.updateCurrentStore(updateDto())).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
