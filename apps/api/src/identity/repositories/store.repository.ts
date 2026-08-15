import { Injectable } from '@nestjs/common';
import { Prisma, Store } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Minimal write input for creating a Store (docs/DATABASE.md §7.2). */
export interface CreateStoreInput {
  name: string;
  slug: string;
  description?: string;
  currency?: string;
  timezone?: string;
}

/** Minimal write input for updating a Store. */
export interface UpdateStoreInput {
  name?: string;
}

/**
 * Persistence access for the `stores` table (the tenant boundary).
 *
 * Encapsulates Prisma access only — no business rules. `create`/`update`
 * accept the transaction client so they participate in the caller's
 * transaction boundary; reads use the shared Prisma client.
 */
@Injectable()
export class StoreRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(tx: Prisma.TransactionClient, data: CreateStoreInput): Promise<Store> {
    return tx.store.create({
      data: {
        name: data.name,
        slug: data.slug,
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.currency !== undefined ? { currency: data.currency } : {}),
        ...(data.timezone !== undefined ? { timezone: data.timezone } : {}),
      },
    });
  }

  async findById(id: string): Promise<Store | null> {
    return this.prisma.store.findUnique({ where: { id } });
  }

  /** Finds a Store inside the caller's transaction (onboarding idempotency). */
  async findByIdTx(tx: Prisma.TransactionClient, id: string): Promise<Store | null> {
    return tx.store.findUnique({ where: { id } });
  }

  async findBySlug(slug: string): Promise<Store | null> {
    return this.prisma.store.findUnique({ where: { slug } });
  }

  async update(tx: Prisma.TransactionClient, id: string, data: UpdateStoreInput): Promise<Store> {
    return tx.store.update({ where: { id }, data: { ...data } });
  }
}
