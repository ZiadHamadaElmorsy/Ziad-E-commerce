import { Injectable } from '@nestjs/common';
import { MembershipRole, MembershipStatus, Prisma, StoreMembership } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Minimal write input for creating a StoreMembership (docs/DATABASE.md §7.3). */
export interface CreateMembershipInput {
  storeId: string;
  userId: string;
  role: MembershipRole;
  status: MembershipStatus;
}

/**
 * Persistence access for the `store_memberships` table.
 *
 * Encapsulates Prisma access only — no business rules. Membership role/status
 * queries always filter by `status = ACTIVE` where membership is the
 * authorization source, so an inactive membership can never resolve.
 */
@Injectable()
export class StoreMembershipRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tx: Prisma.TransactionClient,
    data: CreateMembershipInput,
  ): Promise<StoreMembership> {
    return tx.storeMembership.create({ data: { ...data } });
  }

  /** Finds the ACTIVE membership granting a user access to a store. */
  async findActiveMembership(userId: string, storeId: string): Promise<StoreMembership | null> {
    return this.prisma.storeMembership.findFirst({
      where: { userId, storeId, status: MembershipStatus.ACTIVE },
    });
  }

  /** Finds any membership (any status) for a user in a store. */
  async findMembership(userId: string, storeId: string): Promise<StoreMembership | null> {
    return this.prisma.storeMembership.findFirst({ where: { userId, storeId } });
  }

  /** Lists all ACTIVE memberships for a user across stores. */
  async findActiveMembershipsForUser(userId: string): Promise<StoreMembership[]> {
    return this.prisma.storeMembership.findMany({
      where: { userId, status: MembershipStatus.ACTIVE },
    });
  }
}
