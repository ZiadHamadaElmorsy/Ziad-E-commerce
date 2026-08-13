import { Injectable } from '@nestjs/common';
import { Media, MediaType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Write input for creating a Media metadata row (docs/DATABASE.md §7.25). */
export interface CreateMediaInput {
  /** Server-generated UUID — also the suffix of the storage object key. */
  id: string;
  storeId: string;
  storagePath: string;
  mediaType: MediaType;
  mimeType: string;
  sizeBytes: bigint;
  altText: string | null;
}

/**
 * Persistence access for the `media` and `product_media` tables
 * (docs/DATABASE.md §7.25/§7.26/§22).
 *
 * Every operation is store-scoped: lookups use `findFirst({ where: { id,
 * storeId } })` and deletes use `deleteMany({ where: { id, storeId } })` so a
 * leaked cross-tenant id can never read or remove another Store's media row.
 * Writes run inside `TransactionService.runWithTenant` so RLS always sees the
 * correct tenant (docs/DATABASE.md §29).
 */
@Injectable()
export class MediaRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates a Media metadata row (inside a tenant-bound transaction). */
  async create(tx: Prisma.TransactionClient, data: CreateMediaInput): Promise<Media> {
    return tx.media.create({
      data: {
        id: data.id,
        storeId: data.storeId,
        storagePath: data.storagePath,
        mediaType: data.mediaType,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        altText: data.altText,
      },
    });
  }

  /** Store-scoped lookup by media id (null = absent OR another store's media). */
  async findByIdInStore(storeId: string, mediaId: string): Promise<Media | null> {
    return this.prisma.media.findFirst({ where: { id: mediaId, storeId } });
  }

  /** Store-scoped guarded delete (0 rows = not found / cross-tenant id). */
  async deleteByIdInStore(
    tx: Prisma.TransactionClient,
    storeId: string,
    mediaId: string,
  ): Promise<{ count: number }> {
    return tx.media.deleteMany({ where: { id: mediaId, storeId } });
  }

  /**
   * Counts `product_media` references for a media asset — the RESTRICT guard
   * of docs/DATABASE.md §22.4/§9.2. The database FK remains the final
   * backstop.
   */
  async countProductMediaReferences(
    tx: Prisma.TransactionClient,
    storeId: string,
    mediaId: string,
  ): Promise<number> {
    return tx.productMedia.count({ where: { storeId, mediaId } });
  }
}
