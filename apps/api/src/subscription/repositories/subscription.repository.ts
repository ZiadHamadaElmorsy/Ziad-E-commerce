import { Injectable } from '@nestjs/common';
import { Prisma, Subscription, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Input for the trial Subscription row created with a new Store (US-SUB-001). */
export interface CreateSubscriptionInput {
  storeId: string;
  status: SubscriptionStatus;
  trialStartedAt: Date;
  trialEndsAt: Date;
}

/**
 * Persistence access for the `subscriptions` table (docs/DATABASE.md §7.4).
 *
 * The store id ALWAYS comes from the trusted tenant context (Authenticated
 * User -> ACTIVE StoreMembership -> Store) — never from client input. Every
 * read is store-scoped and every write is a guarded conditional UPDATE
 * (docs/DATABASE.md §26.2) so concurrent requests cannot double-transition.
 */
@Injectable()
export class SubscriptionRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Store-scoped read of the 1:1 subscription row. */
  async findByStoreId(storeId: string): Promise<Subscription | null> {
    return this.prisma.subscription.findUnique({ where: { storeId } });
  }

  /** Creates the trial subscription row inside the store-creation transaction. */
  async create(tx: Prisma.TransactionClient, data: CreateSubscriptionInput): Promise<Subscription> {
    return tx.subscription.create({ data: { ...data } });
  }

  /**
   * Concurrency-safe guarded transition (docs/DATABASE.md §26.2): only a row in
   * the expected source status transitions. Returns the affected row count so
   * the service can fail closed / re-read on a concurrent transition.
   */
  async updateGuarded(
    tx: Prisma.TransactionClient,
    storeId: string,
    fromStatus: SubscriptionStatus,
    data: Prisma.SubscriptionUpdateManyMutationInput,
  ): Promise<{ count: number }> {
    return tx.subscription.updateMany({
      where: { storeId, status: fromStatus },
      data,
    });
  }
}
