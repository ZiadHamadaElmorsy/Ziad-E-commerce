import { SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionRepository } from './subscription.repository';

describe('SubscriptionRepository', () => {
  let prisma: {
    subscription: { findUnique: jest.Mock };
  };
  let repository: SubscriptionRepository;

  const subscriptionRow = {
    id: 'sub-1',
    storeId: 'store-1',
    status: SubscriptionStatus.TRIAL,
    trialStartedAt: new Date('2026-08-12T00:00:00Z'),
    trialEndsAt: new Date('2026-08-26T00:00:00Z'),
    activatedAt: null,
    expiresAt: null,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  beforeEach(() => {
    prisma = { subscription: { findUnique: jest.fn() } };
    repository = new SubscriptionRepository(prisma as unknown as PrismaService);
  });

  it('finds the 1:1 subscription by store id (store-scoped read)', async () => {
    prisma.subscription.findUnique.mockResolvedValue(subscriptionRow);

    const result = await repository.findByStoreId('store-1');

    expect(prisma.subscription.findUnique).toHaveBeenCalledWith({ where: { storeId: 'store-1' } });
    expect(result).toEqual(subscriptionRow);
  });

  it('creates the trial subscription row through the provided transaction client', async () => {
    const tx = {
      subscription: { create: jest.fn().mockResolvedValue(subscriptionRow) },
    };

    const input = {
      storeId: 'store-1',
      status: SubscriptionStatus.TRIAL,
      trialStartedAt: new Date('2026-08-12T00:00:00Z'),
      trialEndsAt: new Date('2026-08-26T00:00:00Z'),
    };
    const result = await repository.create(tx as never, input);

    expect(tx.subscription.create).toHaveBeenCalledWith({ data: { ...input } });
    expect(result).toEqual(subscriptionRow);
  });

  it('performs a guarded transition scoped to the expected source status', async () => {
    const tx = {
      subscription: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };

    const result = await repository.updateGuarded(
      tx as never,
      'store-1',
      SubscriptionStatus.TRIAL,
      { status: SubscriptionStatus.EXPIRED, expiresAt: new Date('2026-08-20T00:00:00Z') },
    );

    expect(tx.subscription.updateMany).toHaveBeenCalledWith({
      where: { storeId: 'store-1', status: SubscriptionStatus.TRIAL },
      data: {
        status: SubscriptionStatus.EXPIRED,
        expiresAt: new Date('2026-08-20T00:00:00Z'),
      },
    });
    expect(result).toEqual({ count: 1 });
  });

  it('returns count 0 when the guarded transition matches nothing', async () => {
    const tx = {
      subscription: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };

    const result = await repository.updateGuarded(
      tx as never,
      'store-1',
      SubscriptionStatus.EXPIRED,
      { status: SubscriptionStatus.ACTIVE, activatedAt: new Date('2026-08-20T00:00:00Z') },
    );

    expect(result).toEqual({ count: 0 });
  });
});
