import { Injectable } from '@nestjs/common';
import {
  Category,
  CategoryStatus,
  Page,
  PageSection,
  PageStatus,
  Prisma,
  Product,
  ProductStatus,
  Store,
  VariantStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Store-scoped list filter for the storefront product collection. */
export interface StorefrontProductListFilter {
  search?: string;
  skip: number;
  take: number;
}

/** Store-scoped list filter for the storefront category collection. */
export interface StorefrontCategoryListFilter {
  skip: number;
  take: number;
}

/** A product row with only the ACTIVE variants + inventory + media loaded. */
export type StorefrontProductWithRelations = Product & {
  variants: Array<{
    id: string;
    name: string;
    price: bigint;
    status: VariantStatus;
    inventory: { onHandQuantity: number; reservedQuantity: number } | null;
  }>;
  productMedia: Array<{ media: { id: string; altText: string | null } }>;
};

/** A PUBLISHED page with its sections ordered by sort_order. */
export type StorefrontPublishedPage = Page & { sections: PageSection[] };

/**
 * Persistence access for the PUBLIC storefront reads (docs/API-SPEC.md §31,
 * docs/DATABASE.md §5.4/§29.6).
 *
 * Every read is scoped to the store resolved by the StorefrontStoreResolver
 * (public slug/domain resolution — never a client-supplied store id as an
 * authorization source) and exposes ONLY:
 *   - ACTIVE products, ACTIVE variants (purchasable), ACTIVE categories,
 *   - PUBLISHED pages,
 *   - public store configuration.
 * DRAFT / ARCHIVED / PUBLISHED-but-unpublished data is never returned.
 *
 * Read-only by construction: no write methods exist on this repository.
 */
@Injectable()
export class StorefrontRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolves a Store by its globally-unique public slug (DATABASE §33 #7). */
  async findStoreBySlug(slug: string): Promise<Store | null> {
    return this.prisma.store.findUnique({ where: { slug } });
  }

  async findActiveProducts(
    storeId: string,
    filter: StorefrontProductListFilter,
  ): Promise<StorefrontProductWithRelations[]> {
    return this.prisma.product.findMany({
      where: this.buildProductWhere(storeId, filter.search),
      skip: filter.skip,
      take: filter.take,
      orderBy: { createdAt: 'desc' },
      include: this.productInclude(),
    });
  }

  async countActiveProducts(storeId: string, search?: string): Promise<number> {
    return this.prisma.product.count({ where: this.buildProductWhere(storeId, search) });
  }

  async findActiveProductBySlug(
    storeId: string,
    slug: string,
  ): Promise<StorefrontProductWithRelations | null> {
    return this.prisma.product.findFirst({
      where: { storeId, slug, status: ProductStatus.ACTIVE },
      include: this.productInclude(),
    });
  }

  async findActiveCategories(
    storeId: string,
    filter: StorefrontCategoryListFilter,
  ): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: { storeId, status: CategoryStatus.ACTIVE },
      skip: filter.skip,
      take: filter.take,
      orderBy: { createdAt: 'desc' },
    });
  }

  async countActiveCategories(storeId: string): Promise<number> {
    return this.prisma.category.count({ where: { storeId, status: CategoryStatus.ACTIVE } });
  }

  async findActiveCategoryBySlug(storeId: string, slug: string): Promise<Category | null> {
    return this.prisma.category.findFirst({
      where: { storeId, slug, status: CategoryStatus.ACTIVE },
    });
  }

  async findActiveProductsByCategory(
    storeId: string,
    categoryId: string,
    filter: StorefrontProductListFilter,
  ): Promise<StorefrontProductWithRelations[]> {
    return this.prisma.product.findMany({
      where: {
        storeId,
        status: ProductStatus.ACTIVE,
        productCategories: { some: { categoryId } },
      },
      skip: filter.skip,
      take: filter.take,
      orderBy: { createdAt: 'desc' },
      include: this.productInclude(),
    });
  }

  async countActiveProductsByCategory(storeId: string, categoryId: string): Promise<number> {
    return this.prisma.product.count({
      where: {
        storeId,
        status: ProductStatus.ACTIVE,
        productCategories: { some: { categoryId } },
      },
    });
  }

  /**
   * Resolves a Media row scoped to the resolved store. Used by the public
   * storefront media proxy (Phase 19): only media belonging to the resolved
   * Store can ever be streamed — a cross-tenant media id fails closed.
   */
  async findMediaInStore(storeId: string, mediaId: string) {
    return this.prisma.media.findFirst({ where: { id: mediaId, storeId } });
  }

  async findPublishedPageBySlug(
    storeId: string,
    slug: string,
  ): Promise<StorefrontPublishedPage | null> {
    return this.prisma.page.findFirst({
      where: { storeId, slug, status: PageStatus.PUBLISHED },
      include: { sections: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  private buildProductWhere(storeId: string, search?: string): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = { storeId, status: ProductStatus.ACTIVE };
    if (search) {
      // MVP-SCOPE §28 / US-STF-004: search by Product Name (within the store).
      where.name = { contains: search, mode: 'insensitive' };
    }
    return where;
  }

  /** ACTIVE (purchasable) variants with inventory, plus ordered media. */
  private productInclude() {
    return {
      variants: {
        where: { status: VariantStatus.ACTIVE },
        include: { inventory: true },
        orderBy: { createdAt: 'asc' as const },
      },
      productMedia: {
        include: { media: true },
        orderBy: { sortOrder: 'asc' as const },
      },
    };
  }
}
