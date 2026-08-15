import { Prisma, MembershipRole, MembershipStatus } from '@prisma/client';
import { RequestContextService } from '../../common/context/request-context.service';
import {
  BadRequestError,
  ConflictError,
  UnauthorizedError,
  ValidationError,
} from '../../common/errors/domain-exceptions';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { SubscriptionService } from '../../subscription/services/subscription.service';
import { CreateMerchantDto } from '../dto/create-merchant.dto';
import { StoreMembershipRepository } from '../repositories/store-membership.repository';
import { StoreRepository } from '../repositories/store.repository';
import { UserRepository } from '../repositories/user.repository';
import { OnboardingService } from './onboarding.service';

describe('OnboardingService', () => {
  let requestContext: { getCurrent: jest.Mock };
  let users: {
    findByAuthUserId: jest.Mock;
    findByAuthUserIdTx: jest.Mock;
    create: jest.Mock;
  };
  let stores: {
    create: jest.Mock;
    findById: jest.Mock;
    findByIdTx: jest.Mock;
  };
  let memberships: {
    create: jest.Mock;
    findActiveMembershipsForUser: jest.Mock;
    findActiveMembershipsForUserTx: jest.Mock;
  };
  let transaction: { run: jest.Mock; runWithTenant: jest.Mock };
  let subscriptions: { startTrial: jest.Mock };
  let service: OnboardingService;

  const storeRow = {
    id: 'store-1',
    name: 'My Store',
    slug: 'my-store',
    description: null,
    status: 'ACTIVE' as const,
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

  const membershipRow = {
    id: 'm-1',
    storeId: 'store-1',
    userId: 'user-1',
    role: MembershipRole.OWNER,
    status: MembershipStatus.ACTIVE,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  beforeEach(() => {
    requestContext = { getCurrent: jest.fn() };
    users = {
      findByAuthUserId: jest.fn(),
      findByAuthUserIdTx: jest.fn(),
      create: jest.fn(),
    };
    stores = { create: jest.fn(), findById: jest.fn(), findByIdTx: jest.fn() };
    memberships = {
      create: jest.fn(),
      findActiveMembershipsForUser: jest.fn(),
      findActiveMembershipsForUserTx: jest.fn(),
    };
    transaction = { run: jest.fn(), runWithTenant: jest.fn() };
    subscriptions = { startTrial: jest.fn().mockResolvedValue(undefined) };

    transaction.run.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => work({}));
    transaction.runWithTenant.mockImplementation(
      async (_storeId: string, work: (tx: unknown) => Promise<unknown>) => work({}),
    );
    memberships.findActiveMembershipsForUserTx.mockResolvedValue([]);
    stores.findByIdTx.mockResolvedValue(null);

    requestContext.getCurrent.mockReturnValue({
      requestId: 'req-1',
      user: { authUserId: 'auth-1', email: 'owner@example.com' },
    });

    service = new OnboardingService(
      requestContext as unknown as RequestContextService,
      users as unknown as UserRepository,
      stores as unknown as StoreRepository,
      memberships as unknown as StoreMembershipRepository,
      transaction as unknown as TransactionService,
      subscriptions as unknown as SubscriptionService,
    );
  });

  function merchantDto(overrides: Partial<CreateMerchantDto> = {}): CreateMerchantDto {
    return {
      firstName: 'Ziad',
      lastName: 'Owner',
      storeName: 'My Store',
      slug: 'my-store',
      currency: 'EGP',
      ...overrides,
    };
  }


  describe('createMerchant', () => {
    it('creates the application User + Store + OWNER membership + TRIAL subscription in one transaction', async () => {
      users.findByAuthUserId.mockResolvedValue(null);
      users.findByAuthUserIdTx.mockResolvedValue(null);
      users.create.mockResolvedValue(userRow);
      stores.create.mockResolvedValue(storeRow);
      memberships.create.mockResolvedValue(membershipRow);

      const result = await service.createMerchant(merchantDto());

      expect(users.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          authUserId: 'auth-1',
          firstName: 'Ziad',
          lastName: 'Owner',
          email: 'owner@example.com',
        }),
      );
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
      expect(subscriptions.startTrial).toHaveBeenCalledWith(expect.anything(), 'store-1');
      expect(transaction.run).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        store: {
          id: 'store-1',
          name: 'My Store',
          slug: 'my-store',
          description: null,
          status: 'ACTIVE',
          currency: 'EGP',
          timezone: 'Africa/Cairo',
        },
        membership: { id: 'm-1', storeId: 'store-1', role: 'OWNER', status: 'ACTIVE' },
      });
    });

    it('does not create a second store when the merchant already has one (idempotent retry)', async () => {
      users.findByAuthUserId.mockResolvedValue(userRow);
      memberships.findActiveMembershipsForUser.mockResolvedValue([membershipRow]);
      stores.findById.mockResolvedValue(storeRow);

      const result = await service.createMerchant(merchantDto());

      expect(transaction.run).not.toHaveBeenCalled();
      expect(stores.create).not.toHaveBeenCalled();
      expect(memberships.create).not.toHaveBeenCalled();
      expect(result.store.id).toBe('store-1');
    });

    it('generates a slug from the store name when none is provided', async () => {
      users.findByAuthUserId.mockResolvedValue(null);
      users.findByAuthUserIdTx.mockResolvedValue(null);
      users.create.mockResolvedValue(userRow);
      stores.create.mockResolvedValue(storeRow);
      memberships.create.mockResolvedValue(membershipRow);

      await service.createMerchant(merchantDto({ slug: undefined }));

      expect(stores.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ slug: 'my-store' }),
      );
    });

    it('rejects an invalid slug with VALIDATION_ERROR', async () => {
      await expect(
        service.createMerchant(merchantDto({ slug: 'Has Space' })),
      ).rejects.toThrow(ValidationError);
      expect(transaction.run).not.toHaveBeenCalled();
    });

    it('fails with UNAUTHORIZED when no authenticated user is present', async () => {
      requestContext.getCurrent.mockReturnValue({ requestId: 'req-1' });
      await expect(service.createMerchant(merchantDto())).rejects.toThrow(UnauthorizedError);
    });

    it('fails with BAD_REQUEST when the token carries no email', async () => {
      requestContext.getCurrent.mockReturnValue({
        requestId: 'req-1',
        user: { authUserId: 'auth-1', email: '' },
      });
      await expect(service.createMerchant(merchantDto())).rejects.toThrow(BadRequestError);
    });
  });

    it('maps a slug uniqueness conflict to CONFLICT', async () => {
      users.findByAuthUserId.mockResolvedValue(null);
      users.findByAuthUserIdTx.mockResolvedValue(null);
      users.create.mockResolvedValue(userRow);
      stores.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { target: ['store_id', 'slug'] },
        }),
      );

      await expect(service.createMerchant(merchantDto())).rejects.toThrow(ConflictError);
    });

    it('maps an email conflict to CONFLICT', async () => {
      users.findByAuthUserId.mockResolvedValue(null);
      users.findByAuthUserIdTx.mockResolvedValue(null);
      users.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { target: ['email'] },
        }),
      );

      await expect(service.createMerchant(merchantDto())).rejects.toThrow(ConflictError);
    });

    it('resolves idempotently when a concurrent request already provisioned the user and store', async () => {
      users.findByAuthUserId.mockResolvedValueOnce(null).mockResolvedValue(userRow);
      users.findByAuthUserIdTx.mockResolvedValue(null);
      users.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { target: ['auth_user_id'] },
        }),
      );
      // After the conflict the retry finds the membership + store.
      memberships.findActiveMembershipsForUser.mockResolvedValue([membershipRow]);
      stores.findById.mockResolvedValue(storeRow);

      const result = await service.createMerchant(merchantDto());

      expect(result.store.id).toBe('store-1');
      expect(users.create).toHaveBeenCalledTimes(1);
      expect(stores.create).not.toHaveBeenCalled();
    });

  describe('getStatus', () => {
    it('returns a store-less status when the application user does not exist yet', async () => {
      users.findByAuthUserId.mockResolvedValue(null);
      const status = await service.getStatus();
      expect(status).toEqual({ user: null, store: null, membership: null });
    });

    it('returns a store-less status when the user has no memberships', async () => {
      users.findByAuthUserId.mockResolvedValue(userRow);
      memberships.findActiveMembershipsForUser.mockResolvedValue([]);
      const status = await service.getStatus();
      expect(status.user?.email).toBe('owner@example.com');
      expect(status.store).toBeNull();
      expect(status.membership).toBeNull();
    });

    it('returns the resolved store + membership when one exists', async () => {
      users.findByAuthUserId.mockResolvedValue(userRow);
      memberships.findActiveMembershipsForUser.mockResolvedValue([membershipRow]);
      stores.findById.mockResolvedValue(storeRow);
      const status = await service.getStatus();
      expect(status.store?.id).toBe('store-1');
      expect(status.membership?.role).toBe('OWNER');
    });

    it('fails with UNAUTHORIZED without an authenticated user', async () => {
      requestContext.getCurrent.mockReturnValue({ requestId: 'req-1' });
      await expect(service.getStatus()).rejects.toThrow(UnauthorizedError);
    });
  });
});

