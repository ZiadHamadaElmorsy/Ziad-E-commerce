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

/**
 * Bounded first page of gallery images returned by the storefront product
 * detail payload. The complete gallery is browsed through
 * GET /storefront/products/:slug/media (paginated) — a 1000-image product
 * never ships 1000 media rows in the detail response and the browser never
 * renders 1000 thumbnails at once.
 */
export const STOREFRONT_GALLERY_PAGE_SIZE = 12;

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
  productCategories?: Array<{
    category: { id: string; name: string; slug: string; description: string | null };
  }>;
  variants: Array<{
    id: string;
    name: string;
    attributes: unknown;
    price: bigint;
    status: VariantStatus;
    inventory: { onHandQuantity: number; reservedQuantity: number } | null;
  }>;
  productMedia: Array<{ media: { id: string; altText: string | null } }>;
};

/** A storefront gallery association row (media id + variant link + order). */
export interface StorefrontMediaRow {
  mediaId: string;
  variantId: string | null;
  altText: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

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
      include: this.productListInclude(),
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
      include: this.productDetailInclude(),
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
      include: this.productListInclude(),
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
   * Paginated storefront gallery for an ACTIVE product (Phase 26). Returns
   * ordered associations (media id + variant link + order + primary flag).
   * The product must be ACTIVE; the associations are store-scoped by the
   * product's store. An optional `variantId` filter returns only the images
   * linked to that variant.
   */
  async findActiveProductMedia(
    storeId: string,
    productId: string,
    filter: { variantId?: string; skip: number; take: number },
  ): Promise<StorefrontMediaRow[]> {
    const where: Prisma.ProductMediaWhereInput = { storeId, productId, product: { status: ProductStatus.ACTIVE } };
    if (filter.variantId) {
      where.variantId = filter.variantId;
    }
    const rows = await this.prisma.productMedia.findMany({
      where,
      select: {
        mediaId: true,
        variantId: true,
        altText: true,
        sortOrder: true,
        isPrimary: true,
      },
      skip: filter.skip,
      take: filter.take,
      orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    });
    return rows.map((row) => ({
      mediaId: row.mediaId,
      variantId: row.variantId,
      altText: row.altText,
      sortOrder: row.sortOrder,
      isPrimary: row.isPrimary,
    }));
  }

  /** Total media count of an ACTIVE product (for gallery pagination). */
  async countActiveProductMedia(storeId: string, productId: string, variantId?: string): Promise<number> {
    const where: Prisma.ProductMediaWhereInput = { storeId, productId, product: { status: ProductStatus.ACTIVE } };
    if (variantId) {
      where.variantId = variantId;
    }
    return this.prisma.productMedia.count({ where });
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

  /**
   * ACTIVE (purchasable) variants with inventory + the PRIMARY cover image
   * only. Used by product LISTS (Phase 26 — a 1000-image product must never
   * drag its whole gallery into every storefront list response).
   */
  private productListInclude() {
    return {
      variants: {
        where: { status: VariantStatus.ACTIVE },
        select: {
          id: true,
          name: true,
          attributes: true,
          price: true,
          status: true,
          inventory: { select: { onHandQuantity: true, reservedQuantity: true } },
        },
        orderBy: { createdAt: 'asc' as const },
      },
      productMedia: {
        select: { media: { select: { id: true, altText: true } } },
        orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
        take: 1,
      },
    };
  }

  /**
   * Product DETAIL include: ACTIVE variants with inventory + attributes +
   * ACTIVE categories + the FIRST page of the ordered gallery (bounded). The
   * complete gallery is paginated through findActiveProductMedia.
   */
  private productDetailInclude() {
    return {
      productCategories: {
        where: { category: { status: CategoryStatus.ACTIVE } },
        select: {
          category: { select: { id: true, name: true, slug: true, description: true } },
        },
        orderBy: { createdAt: 'asc' as const },
      },
      variants: {
        where: { status: VariantStatus.ACTIVE },
        select: {
          id: true,
          name: true,
          attributes: true,
          price: true,
          status: true,
          inventory: { select: { onHandQuantity: true, reservedQuantity: true } },
        },
        orderBy: { createdAt: 'asc' as const },
      },
      productMedia: {
        select: {
          media: { select: { id: true, altText: true } },
          variantId: true,
          isPrimary: true,
          sortOrder: true,
        },
        orderBy: { sortOrder: 'asc' as const },
        take: STOREFRONT_GALLERY_PAGE_SIZE,
      },
      _count: {
        select: {
          productMedia: true,
        },
      },
    };
  }
}
