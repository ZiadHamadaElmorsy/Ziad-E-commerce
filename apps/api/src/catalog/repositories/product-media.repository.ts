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
}

/** A ProductMedia row with its media metadata (for gallery rendering). */
export type ProductMediaWithMedia = ProductMedia & {
  media: { id: string; altText: string | null };
};

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
}
