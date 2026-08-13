import { Injectable } from '@nestjs/common';
import { Category, Prisma, ProductCategory } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Minimal write input for a ProductCategory link (docs/DATABASE.md §7.8). */
export interface CreateProductCategoryInput {
  storeId: string;
  productId: string;
  categoryId: string;
}

/**
 * Persistence access for the `product_categories` table (the N:M join between
 * Products and Categories).
 *
 * Encapsulates Prisma access only — no business rules. The link rows are
 * store-scoped and the composite store-scoped FKs to `products` and
 * `categories` make a cross-tenant link impossible at the database level.
 * `UNIQUE (product_id, category_id)` prevents duplicate links.
 */
@Injectable()
export class ProductCategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tx: Prisma.TransactionClient,
    data: CreateProductCategoryInput,
  ): Promise<ProductCategory> {
    return tx.productCategory.create({ data: { ...data } });
  }

  /** Removes a link (the normal "unassign" operation). Returns the deleted count. */
  async deleteLink(
    tx: Prisma.TransactionClient,
    storeId: string,
    productId: string,
    categoryId: string,
  ): Promise<{ count: number }> {
    return tx.productCategory.deleteMany({
      where: { storeId, productId, categoryId },
    });
  }

  /**
   * Returns the categories assigned to one Product (store-scoped), ordered by
   * assignment time. The category rows always belong to the SAME store as the
   * product — cross-tenant links are impossible at the database level.
   */
  async findCategoriesByProduct(storeId: string, productId: string): Promise<Category[]> {
    const links = await this.prisma.productCategory.findMany({
      where: { storeId, productId },
      include: { category: true },
      orderBy: { createdAt: 'asc' },
    });
    return links.map((link) => link.category);
  }
}
