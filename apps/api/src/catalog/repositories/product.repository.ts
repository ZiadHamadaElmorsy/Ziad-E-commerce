import { Injectable } from '@nestjs/common';
import { Media, Prisma, Product, ProductStatus, ProductVariant } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Bounded first page of product images returned by the merchant product detail
 * view. The complete gallery is browsed through GET /products/:id/media
 * (paginated) — the detail payload never carries 1000 media rows.
 */
export const GALLERY_DETAIL_PAGE_SIZE = 24;

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
  nameAr?: string | null;
  nameEn?: string | null;
  slug: string;
  description?: string;
  status: ProductStatus;
}

/** Minimal write input for updating a Product. */
export interface UpdateProductInput {
  name?: string;
  nameAr?: string | null;
  nameEn?: string | null;
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
      include: this.productListInclude(),
    });
  }

  async count(storeId: string, filter: ProductListFilter): Promise<number> {
    return this.prisma.product.count({ where: this.buildWhere(storeId, filter) });
  }

  /**
   * Product counts grouped by lifecycle status (Phase 25 — dashboard stats).
   * ONE grouped query replaces the four parallel status-filtered counts the
   * dashboard used to fire.
   */
  async countByStatus(
    storeId: string,
  ): Promise<Record<ProductStatus, number>> {
    const grouped = await this.prisma.product.groupBy({
      by: ['status'],
      where: { storeId },
      _count: { _all: true },
    });
    const counts: Record<ProductStatus, number> = {
      DRAFT: 0,
      ACTIVE: 0,
      ARCHIVED: 0,
    };
    for (const row of grouped) {
      counts[row.status] = row._count._all;
    }
    return counts;
  }

  /** Variants (ascending) + ordered product images used by the product detail view. */
  private productInclude() {
    return {
      variants: { orderBy: { createdAt: 'asc' as const } },
      productMedia: {
        include: { media: true },
        orderBy: { sortOrder: 'asc' as const },
        // Phase 26 — bounded first page: the merchant gallery is fully browsed
        // through GET /products/:id/media (paginated), so the detail view never
        // drags 1000 media rows into one response.
        take: GALLERY_DETAIL_PAGE_SIZE,
      },
    };
  }

  /**
   * Lean list include (Phase 25 — payload/query audit). Collection endpoints
   * fetch variants (price display) and the PRIMARY cover image only
   * (Phase 26 — never the whole gallery): the list renders name/status/price
   * plus one thumbnail; full media is browsed via the product detail path.
   */
  private productListInclude() {
    return {
      variants: { orderBy: { createdAt: 'asc' as const } },
      productMedia: {
        include: { media: true },
        // Primary cover first, then lowest sort_order — at most ONE row.
        orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
        take: 1,
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
