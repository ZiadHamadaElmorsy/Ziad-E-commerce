import { Injectable, Logger } from '@nestjs/common';
import { requireStoreId } from '../../catalog/domain/catalog-tenant';
import { RequestContextService } from '../../common/context/request-context.service';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/domain-exceptions';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { toMediaView, MediaView } from '../media.types';
import { mapMediaWriteError } from '../domain/media-error.mapper';
import { buildStorageKey, generateMediaId } from '../domain/media-storage-keys';
import { deriveMediaType, isUsableMimeType, normalizeMimeType } from '../domain/media-type';
import { MediaRepository } from '../repositories/media.repository';
import { StorageProvider } from '../storage/storage-provider';

/** Input of the direct server upload (POST /api/v1/media). */
export interface CreateMediaUploadInput {
  data: Buffer;
  contentType?: string;
  altText?: string;
}

/**
 * Media application service (docs/API-SPEC.md §29, docs/DOMAIN-MODEL.md §15.1,
 * docs/DATABASE.md §7.25/§22).
 *
 * Upload flow — direct server upload (the only flow the API-SPEC defines):
 *
 *   1. resolve the trusted store from the tenant context (never client input)
 *   2. validate the binary: a classifiable Content-Type is required (the
 *      media_type column is NOT NULL) and the body must be non-empty
 *   3. generate the media id and the tenant-scoped storage key
 *      {store_id}/{media_id}
 *   4. store the binary in Supabase Storage (StorageProvider) BEFORE creating
 *      any metadata row, so a media row always references a stored object
 *   5. create the metadata row inside a tenant-bound transaction
 *
 * Get is a store-scoped metadata lookup that fails closed (no existence leak).
 *
 * Delete is physical (docs/DATABASE.md §25.1/§22.4):
 *   1. store-scoped lookup (NOT_FOUND for absent / cross-tenant ids)
 *   2. product_media references -> CONFLICT (RESTRICT backstop)
 *   3. delete the metadata row inside a tenant-bound transaction (the DB
 *      FK `theme_configurations.logo_media_id ... ON DELETE SET NULL`
 *      automatically clears any logo reference — docs/DATABASE.md §9.2)
 *   4. best-effort storage object deletion afterwards. The DB delete is
 *      committed first so a media row can never point to a missing object;
 *      if the storage cleanup fails, the orphaned object is logged and the
 *      limitation is documented (external storage cannot be rolled back —
 *      docs/DATABASE.md §28.7).
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly requestContext: RequestContextService,
    private readonly media: MediaRepository,
    private readonly transaction: TransactionService,
    private readonly storage: StorageProvider,
  ) {}

  /** POST /api/v1/media — stores the binary and creates the metadata record. */
  async createUpload(input: CreateMediaUploadInput): Promise<MediaView> {
    const storeId = requireStoreId(this.requestContext);

    const mimeType = this.validateUpload(input);
    const mediaType = deriveMediaType(mimeType);
    const mediaId = generateMediaId();
    const storagePath = buildStorageKey(storeId, mediaId);

    // Step 4 — store the binary first: no metadata row is created before the
    // object exists (a media row must always reference a stored object).
    await this.storage.uploadObject(storagePath, input.data, mimeType);

    // Step 5 — metadata row inside a tenant-bound transaction.
    try {
      const media = await this.transaction.runWithTenant(storeId, (tx) =>
        this.media.create(tx, {
          id: mediaId,
          storeId,
          storagePath,
          mediaType,
          mimeType,
          sizeBytes: BigInt(input.data.length),
          altText: input.altText?.trim() ? input.altText.trim() : null,
        }),
      );
      return toMediaView(media);
    } catch (error) {
      // The object may already exist in storage while the DB row failed; the
      // orphan-object window is documented (external storage cannot be rolled
      // back — docs/DATABASE.md §28.7).
      throw mapMediaWriteError(error);
    }
  }

  /** GET /api/v1/media/:mediaId — store-scoped metadata + storage reference. */
  async getMedia(mediaId: string): Promise<MediaView> {
    const storeId = requireStoreId(this.requestContext);

    const media = await this.media.findByIdInStore(storeId, mediaId);
    if (!media) {
      throw new NotFoundError('The media asset was not found.');
    }
    return toMediaView(media);
  }

  /** DELETE /api/v1/media/:mediaId — physical delete (metadata + storage object). */
  async deleteMedia(mediaId: string): Promise<void> {
    const storeId = requireStoreId(this.requestContext);

    const media = await this.media.findByIdInStore(storeId, mediaId);
    if (!media) {
      throw new NotFoundError('The media asset was not found.');
    }

    let storagePath: string;
    try {
      storagePath = await this.transaction.runWithTenant(storeId, async (tx) => {
        // Reference guard (DATABASE §22.4): media rows referenced by
        // product_media are RESTRICT protected. The DB FK remains the final
        // backstop (mapped by mapMediaWriteError).
        const references = await this.media.countProductMediaReferences(tx, storeId, mediaId);
        if (references > 0) {
          throw new ConflictError('The media asset is referenced and cannot be deleted.');
        }

        const result = await this.media.deleteByIdInStore(tx, storeId, mediaId);
        if (result.count === 0) {
          throw new NotFoundError('The media asset was not found.');
        }
        return media.storagePath;
      });
    } catch (error) {
      throw mapMediaWriteError(error);
    }

    // Best-effort storage cleanup AFTER the committed DB delete (a media row
    // never points at a missing object). A cleanup failure is logged and does
    // not fail the request — the orphaned object is documented as a
    // consistency limitation (no cleanup job is documented in the MVP).
    try {
      await this.storage.deleteObject(storagePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Storage object cleanup failed for media ${mediaId} (${storagePath}): ${message}`,
      );
    }
  }

  private validateUpload(input: CreateMediaUploadInput): string {
    if (!isUsableMimeType(input.contentType)) {
      throw new ValidationError('A media file Content-Type is required.');
    }
    if (!input.data || input.data.length === 0) {
      throw new ValidationError('The media file body cannot be empty.');
    }
    return normalizeMimeType(input.contentType);
  }
}
