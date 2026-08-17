import { Injectable } from '@nestjs/common';
import { Prisma, ProductMedia } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Minimal write input for a ProductMedia link (product image, docs/DATABASE.md §7.26). */
export interface CreateProductMediaInput {
  storeId: string;
  productId: string;
  mediaId: string;
  /** Ordering position within the product gallery (0-based). */
  sortOrder: number;
  /** Variant association (nullable — product-level image). */
  variantId?: string | null;
  /** Per-association alt text (nullable — overrides the media row). */
  altText?: string | null;
  /** Primary/cover flag. */
  isPrimary?: boolean;
}

/** A ProductMedia row with its media metadata (for gallery rendering). */
export type ProductMediaWithMedia = ProductMedia & {
  media: { id: string; altText: string | null };
};

/** A ProductMedia row with the FULL media metadata (gallery list view). */
export type ProductMediaGalleryRow = ProductMedia & {
  media: {
    id: string;
    mediaType: string;
    mimeType: string | null;
    sizeBytes: bigint | null;
    altText: string | null;
  };
};

/** Updateable fields on a single ProductMedia association. */
export interface UpdateProductMediaInput {
  sortOrder?: number;
  isPrimary?: boolean;
  variantId?: string | null;
  altText?: string | null;
}

/** Store-scoped gallery list filter. */
export interface ProductMediaListFilter {
  variantId?: string;
  skip: number;
  take: number;
}

/**
 * Persistence access for the `product_media` table (the ordered N:M join
 * between Products and Media — product images).
 *
 * Encapsulates Prisma access only — no business rules. The link rows are
 * store-scoped and the composite store-scoped FKs to `products` and `media`
 * make a cross-tenant link impossible at the database level.
 * `UNIQUE (product_id, media_id)` prevents duplicate links.
 */
@Injectable()
export class ProductMediaRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates a product image link inside a tenant-bound transaction. */
  async create(tx: Prisma.TransactionClient, data: CreateProductMediaInput): Promise<ProductMedia> {
    return tx.productMedia.create({ data: { ...data } });
  }

  /** Removes a product image link. Returns the deleted count (0 = absent). */
  async deleteLink(
    tx: Prisma.TransactionClient,
    storeId: string,
    productId: string,
    mediaId: string,
  ): Promise<{ count: number }> {
    return tx.productMedia.deleteMany({
      where: { storeId, productId, mediaId },
    });
  }

  /** Updates ONE store-scoped association. Returns null when absent. */
  async updateLink(
    tx: Prisma.TransactionClient,
    storeId: string,
    productId: string,
    mediaId: string,
    data: UpdateProductMediaInput,
  ): Promise<ProductMedia | null> {
    const found = await tx.productMedia.findFirst({
      where: { storeId, productId, mediaId },
    });
    if (!found) return null;
    return tx.productMedia.update({
      where: { id: found.id },
      data: { ...data },
    });
  }

  /** Clears the primary flag on every association of a product. */
  async clearPrimary(
    tx: Prisma.TransactionClient,
    storeId: string,
    productId: string,
  ): Promise<{ count: number }> {
    return tx.productMedia.updateMany({
      where: { storeId, productId, isPrimary: true },
      data: { isPrimary: false },
    });
  }

  /**
   * Batch-reorders the product gallery: assigns positions 0..n-1 to the given
   * media ids. Only media ids attached to the product are touched.
   */
  async reorderLinks(
    tx: Prisma.TransactionClient,
    storeId: string,
    productId: string,
    mediaIds: string[],
  ): Promise<void> {
    for (let index = 0; index < mediaIds.length; index += 1) {
      await tx.productMedia.updateMany({
        where: { storeId, productId, mediaId: mediaIds[index] },
        data: { sortOrder: index },
      });
    }
  }

  /**
   * Current highest sort_order in a product's gallery. Used to append new
   * images at the end (sort_order of the first image is 0). Returns -1 when
   * the product has no images yet.
   */
  async maxSortOrder(
    tx: Prisma.TransactionClient,
    storeId: string,
    productId: string,
  ): Promise<number> {
    const aggregate = await tx.productMedia.aggregate({
      where: { storeId, productId },
      _max: { sortOrder: true },
    });
    return aggregate._max.sortOrder ?? -1;
  }

  /** The ordered product images for one product (media metadata only). */
  async findImagesByProduct(storeId: string, productId: string): Promise<ProductMediaWithMedia[]> {
    return this.prisma.productMedia.findMany({
      where: { storeId, productId },
      include: { media: { select: { id: true, altText: true } } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /** Paginated gallery metadata for one product (media full metadata). */
  async findGalleryByProduct(
    storeId: string,
    productId: string,
    filter: ProductMediaListFilter,
  ): Promise<ProductMediaGalleryRow[]> {
    const where: Prisma.ProductMediaWhereInput = { storeId, productId };
    if (filter.variantId) {
      where.variantId = filter.variantId;
    }
    return this.prisma.productMedia.findMany({
      where,
      include: {
        media: {
          select: {
            id: true,
            mediaType: true,
            mimeType: true,
            sizeBytes: true,
            altText: true,
          },
        },
      },
      skip: filter.skip,
      take: filter.take,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** Gallery row count (optionally variant-filtered) for pagination meta. */
  async countByProduct(
    storeId: string,
    productId: string,
    variantId?: string,
  ): Promise<number> {
    const where: Prisma.ProductMediaWhereInput = { storeId, productId };
    if (variantId) {
      where.variantId = variantId;
    }
    return this.prisma.productMedia.count({ where });
  }

  /** The PRIMARY cover image id of a product, or null. */
  async findPrimaryMediaId(storeId: string, productId: string): Promise<string | null> {
    const primary = await this.prisma.productMedia.findFirst({
      where: { storeId, productId, isPrimary: true },
      select: { mediaId: true },
      orderBy: { sortOrder: 'asc' },
    });
    return primary?.mediaId ?? null;
  }
}
