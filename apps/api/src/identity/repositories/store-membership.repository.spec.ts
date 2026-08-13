import { MembershipRole, MembershipStatus, Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { StoreMembershipRepository } from './store-membership.repository';

describe('StoreMembershipRepository', () => {
  let prisma: {
    storeMembership: { create: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock };
  };
  let repository: StoreMembershipRepository;
  let tx: Prisma.TransactionClient;

  beforeEach(() => {
    prisma = {
      storeMembership: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    };
    repository = new StoreMembershipRepository(prisma as unknown as PrismaService);
    tx = {
      storeMembership: { create: jest.fn() },
    } as unknown as Prisma.TransactionClient;
  });

  it('create persists the given role and status through the transaction client', async () => {
    (tx.storeMembership.create as jest.Mock).mockResolvedValue({ id: 'm-1' });

    await repository.create(tx, {
      storeId: 'store-1',
      userId: 'user-1',
      role: MembershipRole.OWNER,
      status: MembershipStatus.ACTIVE,
    });

    expect(tx.storeMembership.create).toHaveBeenCalledWith({
      data: {
        storeId: 'store-1',
        userId: 'user-1',
        role: 'OWNER',
        status: 'ACTIVE',
      },
    });
  });

  it('findActiveMembership filters by ACTIVE status (inactive can never resolve)', async () => {
    prisma.storeMembership.findFirst.mockResolvedValue({
      id: 'm-1',
      role: 'OWNER',
      status: 'ACTIVE',
    });

    await repository.findActiveMembership('user-1', 'store-1');

    expect(prisma.storeMembership.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', storeId: 'store-1', status: 'ACTIVE' },
    });
  });

  it('findMembership looks up any membership status', async () => {
    prisma.storeMembership.findFirst.mockResolvedValue({
      id: 'm-1',
      role: 'ADMIN',
      status: 'INACTIVE',
    });

    await repository.findMembership('user-1', 'store-1');

    expect(prisma.storeMembership.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', storeId: 'store-1' },
    });
  });

  it('findActiveMembershipsForUser lists only ACTIVE memberships', async () => {
    prisma.storeMembership.findMany.mockResolvedValue([]);

    await repository.findActiveMembershipsForUser('user-1');

    expect(prisma.storeMembership.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', status: 'ACTIVE' },
    });
  });
});
