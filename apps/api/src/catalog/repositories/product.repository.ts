import { Injectable } from '@nestjs/common';
import { Media, Prisma, Product, ProductStatus, ProductVariant } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** A product_media row with its media metadata (product images). */
export type ProductMediaWithMedia = {
  media: Pick<Media, 'id' | 'altText'>;
};

/** A Product row with its variants + ordered images loaded (used for views). */
export type ProductWithVariants = Product & {
  variants: ProductVariant[];
  productMedia?: Array<{ media: { id: string; altText: string | null } }>;
};

/** Minimal write input for creating a Product (docs/DATABASE.md §7.5). */
export interface CreateProductInput {
  storeId: string;
  name: string;
  slug: string;
  description?: string;
  status: ProductStatus;
}

/** Minimal write input for updating a Product. */
export interface UpdateProductInput {
  name?: string;
  description?: string;
}

/** Store-scoped list filter for the product collection endpoint. */
export interface ProductListFilter {
  search?: string;
  status?: ProductStatus;
  categoryId?: string;
  skip: number;
  take: number;
  orderBy: Prisma.ProductOrderByWithRelationInput;
}

/**
 * Persistence access for the `products` table.
 *
 * Encapsulates Prisma access only — no business rules. Every read and write is
 * store-scoped: writes use the composite `storeId_id` unique target and reads
 * filter by storeId, so a Catalog operation can never touch another tenant's
 * rows (RLS remains the final defense boundary).
 */
@Injectable()
export class ProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(tx: Prisma.TransactionClient, data: CreateProductInput): Promise<Product> {
    return tx.product.create({ data: { ...data } });
  }

  async update(
    tx: Prisma.TransactionClient,
    storeId: string,
    productId: string,
    data: UpdateProductInput,
  ): Promise<Product> {
    return tx.product.update({
      where: { storeId_id: { storeId, id: productId } },
      data: { ...data },
    });
  }

  /**
   * Concurrency-safe lifecycle transition (docs/DATABASE.md §26.2 — guarded
   * UPDATE WHERE status = current). Returns the affected row count; 0 means
   * the row is missing or no longer in the expected source state.
   */
  async updateStatus(
    tx: Prisma.TransactionClient,
    storeId: string,
    productId: string,
    from: ProductStatus,
    to: ProductStatus,
  ): Promise<{ count: number }> {
    return tx.product.updateMany({
      where: { id: productId, storeId, status: from },
      data: { status: to },
    });
  }

  /** Store-scoped slug existence check (used to resolve slug collisions). */
  async existsBySlug(
    tx: Prisma.TransactionClient,
    storeId: string,
    slug: string,
  ): Promise<boolean> {
    const found = await tx.product.findFirst({
      where: { storeId, slug },
      select: { id: true },
    });
    return found !== null;
  }

  async findById(
    storeId: string,
    productId: string,
    includeVariants?: false,
  ): Promise<Product | null>;
  async findById(
    storeId: string,
    productId: string,
    includeVariants: true,
  ): Promise<ProductWithVariants | null>;
  async findById(
    storeId: string,
    productId: string,
    includeVariants = false,
  ): Promise<(Product & { variants?: ProductVariant[]; productMedia?: unknown }) | null> {
    return this.prisma.product.findUnique({
      where: { storeId_id: { storeId, id: productId } },
      ...(includeVariants ? { include: this.productInclude() } : {}),
    });
  }

  async findMany(storeId: string, filter: ProductListFilter): Promise<ProductWithVariants[]> {
    return this.prisma.product.findMany({
      where: this.buildWhere(storeId, filter),
      skip: filter.skip,
      take: filter.take,
      orderBy: filter.orderBy,
      include: this.productInclude(),
    });
  }

  async count(storeId: string, filter: ProductListFilter): Promise<number> {
    return this.prisma.product.count({ where: this.buildWhere(storeId, filter) });
  }

  /** Variants (ascending) + ordered product images used by every product view. */
  private productInclude() {
    return {
      variants: { orderBy: { createdAt: 'asc' as const } },
      productMedia: {
        include: { media: true },
        orderBy: { sortOrder: 'asc' as const },
      },
    };
  }

  private buildWhere(storeId: string, filter: ProductListFilter): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = { storeId };

    if (filter.status) {
      where.status = filter.status;
    }

    if (filter.search) {
      where.OR = [
        { name: { contains: filter.search, mode: 'insensitive' } },
        { slug: { contains: filter.search, mode: 'insensitive' } },
      ];
    }

    if (filter.categoryId) {
      where.productCategories = { some: { categoryId: filter.categoryId } };
    }

    return where;
  }
}
