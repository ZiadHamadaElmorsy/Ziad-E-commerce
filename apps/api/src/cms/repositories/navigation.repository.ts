import { Injectable } from '@nestjs/common';
import { Navigation, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Minimal write input for creating a Navigation (docs/DATABASE.md §7.23). */
export interface CreateNavigationInput {
  storeId: string;
  name: string;
  items: Prisma.InputJsonValue;
}

/** Minimal write input for replacing a Navigation (PUT semantics). */
export interface UpdateNavigationInput {
  name: string;
  items: Prisma.InputJsonValue;
}

/**
 * Persistence access for the `navigations` table.
 *
 * The API contract treats navigation as a SINGLETON store resource
 * (GET/PUT /api/v1/navigation — API-SPEC §27). The table has no UNIQUE
 * (store_id) constraint, so every read/write is store-scoped: writes use
 * `updateMany WHERE id + storeId` so a navigation can never be modified
 * across tenants even if the row id leaked.
 */
@Injectable()
export class NavigationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The current navigation of a store (oldest row wins when >1 exist). */
  async findForStore(storeId: string): Promise<Navigation | null> {
    return this.prisma.navigation.findFirst({
      where: { storeId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Transaction-scoped variant of {@link findForStore}. */
  async findForStoreTx(tx: Prisma.TransactionClient, storeId: string): Promise<Navigation | null> {
    return tx.navigation.findFirst({
      where: { storeId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(tx: Prisma.TransactionClient, data: CreateNavigationInput): Promise<Navigation> {
    return tx.navigation.create({ data: { ...data } });
  }

  /** Store-scoped guarded replacement (0 rows = navigation not found). */
  async update(
    tx: Prisma.TransactionClient,
    storeId: string,
    navigationId: string,
    data: UpdateNavigationInput,
  ): Promise<{ count: number }> {
    return tx.navigation.updateMany({
      where: { id: navigationId, storeId },
      data,
    });
  }
}
