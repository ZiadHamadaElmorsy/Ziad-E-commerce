import { Injectable } from '@nestjs/common';
import { Category, CategoryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Minimal write input for creating a Category (docs/DATABASE.md §7.7). */
export interface CreateCategoryInput {
  storeId: string;
  name: string;
  slug: string;
  description?: string;
  status: CategoryStatus;
}

/** Minimal write input for updating a Category. */
export interface UpdateCategoryInput {
  name?: string;
  description?: string;
}

/** Store-scoped list filter for the category collection endpoint. */
export interface CategoryListFilter {
  skip: number;
  take: number;
  orderBy: Prisma.CategoryOrderByWithRelationInput;
}

/**
 * Persistence access for the `categories` table.
 *
 * Encapsulates Prisma access only — no business rules. Every read and write is
 * store-scoped (composite `storeId_id` unique target / storeId filters). MVP
 * categories are FLAT — no parent/child hierarchy is represented.
 */
@Injectable()
export class CategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(tx: Prisma.TransactionClient, data: CreateCategoryInput): Promise<Category> {
    return tx.category.create({ data: { ...data } });
  }

  async update(
    tx: Prisma.TransactionClient,
    storeId: string,
    categoryId: string,
    data: UpdateCategoryInput,
  ): Promise<Category> {
    return tx.category.update({
      where: { storeId_id: { storeId, id: categoryId } },
      data: { ...data },
    });
  }

  /**
   * Concurrency-safe lifecycle transition (docs/DATABASE.md §26.2 — guarded
   * UPDATE WHERE status = current).
   */
  async updateStatus(
    tx: Prisma.TransactionClient,
    storeId: string,
    categoryId: string,
    from: CategoryStatus,
    to: CategoryStatus,
  ): Promise<{ count: number }> {
    return tx.category.updateMany({
      where: { id: categoryId, storeId, status: from },
      data: { status: to },
    });
  }

  /** Store-scoped slug existence check (used to resolve slug collisions). */
  async existsBySlug(
    tx: Prisma.TransactionClient,
    storeId: string,
    slug: string,
  ): Promise<boolean> {
    const found = await tx.category.findFirst({
      where: { storeId, slug },
      select: { id: true },
    });
    return found !== null;
  }

  async findById(storeId: string, categoryId: string): Promise<Category | null> {
    return this.prisma.category.findUnique({
      where: { storeId_id: { storeId, id: categoryId } },
    });
  }

  async findMany(storeId: string, filter: CategoryListFilter): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: { storeId },
      skip: filter.skip,
      take: filter.take,
      orderBy: filter.orderBy,
    });
  }

  async count(storeId: string): Promise<number> {
    return this.prisma.category.count({ where: { storeId } });
  }
}
