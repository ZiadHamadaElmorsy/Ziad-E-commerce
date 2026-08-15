import { ConfigService } from '@nestjs/config';
import { MediaType } from '@prisma/client';
import { RequestContextService } from '../../common/context/request-context.service';
import {
  ConflictError,
  NotFoundError,
  StorageError,
  TenantContextRequiredError,
  ValidationError,
} from '../../common/errors/domain-exceptions';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { MediaRepository } from '../repositories/media.repository';
import { StorageProvider } from '../storage/storage-provider';
import { MediaService } from './media.service';

/** Minimal valid PNG bytes (magic + padding) for content/type consistency. */
export function pngBuffer(size = 64): Buffer {
  const magic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([magic, Buffer.alloc(Math.max(4, size - magic.length))]);
}

describe('MediaService', () => {
  let requestContext: { getCurrent: jest.Mock };
  let media: {
    findByIdInStore: jest.Mock;
    create: jest.Mock;
    deleteByIdInStore: jest.Mock;
    countProductMediaReferences: jest.Mock;
  };
  let transaction: { runWithTenant: jest.Mock };
  let storage: { uploadObject: jest.Mock; deleteObject: jest.Mock };
  let configService: { get: jest.Mock };
  let service: MediaService;

  const storeId = 'store-1';

  beforeEach(() => {
    requestContext = {
      getCurrent: jest.fn().mockReturnValue({ store: { id: storeId } }),
    };
    media = {
      findByIdInStore: jest.fn(),
      create: jest.fn(),
      deleteByIdInStore: jest.fn(),
      countProductMediaReferences: jest.fn(),
    };
    transaction = {
      runWithTenant: jest
        .fn()
        .mockImplementation(async (store: string, work: (tx: never) => unknown) =>
          work(tx as never),
        ),
    };
    storage = {
      uploadObject: jest.fn().mockResolvedValue(undefined),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    configService = { get: jest.fn().mockReturnValue(undefined) };

    service = new MediaService(
      requestContext as unknown as RequestContextService,
      media as unknown as MediaRepository,
      transaction as unknown as TransactionService,
      storage as unknown as StorageProvider,
      configService as unknown as ConfigService,
    );

    // Deterministic Phase 21 media limits (10 MB, image allowlist).
    withMediaConfig();
  });

  function withMediaConfig(overrides: Partial<{ maxUploadBytes: number; allowedMimeTypes: string[] }> = {}): void {
    configService.get.mockImplementation((key: string) => {
      if (key === 'media.maxUploadBytes') {
        return overrides.maxUploadBytes ?? 10 * 1024 * 1024;
      }
      if (key === 'media.allowedMimeTypes') {
        return overrides.allowedMimeTypes ?? [
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/gif',
          'image/avif',
        ];
      }
      return undefined;
    });
  }

  const tx = {} as never;

  function createdRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'media-1',
      storeId,
      storagePath: `${storeId}/media-1`,
      mediaType: MediaType.IMAGE,
      mimeType: 'image/png',
      sizeBytes: 4n,
      altText: null,
      createdAt: new Date('2026-08-12T00:00:00Z'),
      ...overrides,
    };
  }

  describe('createUpload', () => {
    it('stores the binary first, then creates the metadata row in a tenant-bound transaction', async () => {
      media.create.mockResolvedValue(createdRow());
      const data = pngBuffer();

      const view = await service.createUpload({
        data,
        contentType: 'image/png',
      });

      // Storage upload happens BEFORE any DB row (a row always references a stored object).
      expect(storage.uploadObject).toHaveBeenCalledTimes(1);
      expect(storage.uploadObject).toHaveBeenCalledWith(
        expect.stringMatching(/^store-1\/[0-9a-f-]{36}$/),
        data,
        'image/png',
      );
      expect(transaction.runWithTenant).toHaveBeenCalledWith(storeId, expect.any(Function));
      expect(media.create).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          storeId,
          mediaType: MediaType.IMAGE,
          mimeType: 'image/png',
          sizeBytes: BigInt(data.length),
        }),
      );
      expect(view).toMatchObject({
        mediaType: MediaType.IMAGE,
        mimeType: 'image/png',
        sizeBytes: 4,
        storagePath: 'store-1/media-1',
      });
    });

    it('rejects an unsupported MIME type (strict allowlist, Phase 21)', async () => {
      // The allowlist is image/* only — video and generic files are rejected
      // instead of being stored as VIDEO/FILE rows.
      await expect(
        service.createUpload({ data: Buffer.from('xxxx'), contentType: 'video/mp4' }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        service.createUpload({ data: Buffer.from('xxxx'), contentType: 'application/pdf' }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(storage.uploadObject).not.toHaveBeenCalled();
    });

    it('rejects content that does not match its declared MIME type (magic bytes, Phase 21)', async () => {
      // PNG bytes declared as JPEG -> the sniffed type differs.
      await expect(
        service.createUpload({ data: pngBuffer(), contentType: 'image/jpeg' }),
      ).rejects.toBeInstanceOf(ValidationError);

      // Plain text with an image Content-Type -> no image signature.
      await expect(
        service.createUpload({ data: Buffer.from('not an image at all'), contentType: 'image/png' }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(storage.uploadObject).not.toHaveBeenCalled();
    });

    it('rejects an upload larger than the configured maximum (Phase 21)', async () => {
      withMediaConfig({ maxUploadBytes: 32 });
      const oversized = pngBuffer(64);

      await expect(
        service.createUpload({ data: oversized, contentType: 'image/png' }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(storage.uploadObject).not.toHaveBeenCalled();
    });

    it('accepts an allowed MIME type at exactly the configured maximum', async () => {
      withMediaConfig({ maxUploadBytes: 64 });
      media.create.mockResolvedValue(createdRow());

      const data = pngBuffer(64);
      await expect(
        service.createUpload({ data, contentType: 'image/png' }),
      ).resolves.toMatchObject({ mimeType: 'image/png' });
      expect(storage.uploadObject).toHaveBeenCalledTimes(1);
    });

    it('normalizes a parameterized Content-Type and trims alt text', async () => {
      media.create.mockResolvedValue(createdRow({ altText: 'My logo' }));

      await service.createUpload({
        data: pngBuffer(),
        contentType: 'image/Png; charset=binary',
        altText: '  My logo  ',
      });

      expect(media.create).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ mimeType: 'image/png', altText: 'My logo' }),
      );
    });

    it('rejects an upload without a classifiable Content-Type (VALIDATION_ERROR)', async () => {
      await expect(
        service.createUpload({ data: Buffer.from('x'), contentType: undefined }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(storage.uploadObject).not.toHaveBeenCalled();
    });

    it('rejects an empty body (VALIDATION_ERROR)', async () => {
      await expect(
        service.createUpload({ data: Buffer.alloc(0), contentType: 'image/png' }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(storage.uploadObject).not.toHaveBeenCalled();
    });

    it('propagates a storage failure as StorageError and never creates a DB row', async () => {
      storage.uploadObject.mockRejectedValue(new StorageError('Media storage is unavailable.'));

      await expect(
        service.createUpload({ data: pngBuffer(), contentType: 'image/png' }),
      ).rejects.toBeInstanceOf(StorageError);
      expect(media.create).not.toHaveBeenCalled();
    });

    it('maps a DB write failure after the upload to the domain taxonomy (orphan documented)', async () => {
      storage.uploadObject.mockResolvedValue(undefined);
      media.create.mockRejectedValue(new Error('boom'));

      await expect(
        service.createUpload({ data: pngBuffer(), contentType: 'image/png' }),
      ).rejects.toThrow('boom');
    });

    it('fails closed without a tenant context', async () => {
      requestContext.getCurrent.mockReturnValue({ store: undefined });

      await expect(
        service.createUpload({ data: Buffer.from('x'), contentType: 'image/png' }),
      ).rejects.toBeInstanceOf(TenantContextRequiredError);
    });
  });

  describe('getMedia', () => {
    it('returns the media view for an in-store media id', async () => {
      media.findByIdInStore.mockResolvedValue(createdRow());

      const view = await service.getMedia('media-1');

      expect(media.findByIdInStore).toHaveBeenCalledWith(storeId, 'media-1');
      expect(view.id).toBe('media-1');
    });

    it('fails closed with NOT_FOUND for an absent id', async () => {
      media.findByIdInStore.mockResolvedValue(null);

      await expect(service.getMedia('media-999')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('never leaks another store media: a cross-tenant id resolves to NOT_FOUND', async () => {
      media.findByIdInStore.mockResolvedValue(null);

      await expect(service.getMedia('media-foreign')).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('deleteMedia', () => {
    it('deletes unreferenced media: row in a tenant-bound transaction + storage object cleanup', async () => {
      media.findByIdInStore.mockResolvedValue(createdRow({ storagePath: 'store-1/media-1' }));
      media.countProductMediaReferences.mockResolvedValue(0);
      media.deleteByIdInStore.mockResolvedValue({ count: 1 });

      await service.deleteMedia('media-1');

      expect(transaction.runWithTenant).toHaveBeenCalledWith(storeId, expect.any(Function));
      expect(media.countProductMediaReferences).toHaveBeenCalledWith(tx, storeId, 'media-1');
      expect(media.deleteByIdInStore).toHaveBeenCalledWith(tx, storeId, 'media-1');
      expect(storage.deleteObject).toHaveBeenCalledWith('store-1/media-1');
    });

    it('refuses to delete a product-referenced media (CONFLICT) and never touches storage', async () => {
      media.findByIdInStore.mockResolvedValue(createdRow());
      media.countProductMediaReferences.mockResolvedValue(1);

      await expect(service.deleteMedia('media-1')).rejects.toBeInstanceOf(ConflictError);
      expect(media.deleteByIdInStore).not.toHaveBeenCalled();
      expect(storage.deleteObject).not.toHaveBeenCalled();
    });

    it('fails closed with NOT_FOUND for an absent/cross-tenant id', async () => {
      media.findByIdInStore.mockResolvedValue(null);

      await expect(service.deleteMedia('media-999')).rejects.toBeInstanceOf(NotFoundError);
      expect(storage.deleteObject).not.toHaveBeenCalled();
    });

    it('surfaces NOT_FOUND when the guarded delete matches no row (race)', async () => {
      media.findByIdInStore.mockResolvedValue(createdRow());
      media.countProductMediaReferences.mockResolvedValue(0);
      media.deleteByIdInStore.mockResolvedValue({ count: 0 });

      await expect(service.deleteMedia('media-1')).rejects.toBeInstanceOf(NotFoundError);
      expect(storage.deleteObject).not.toHaveBeenCalled();
    });

    it('still succeeds when the post-commit storage cleanup fails (orphan logged, not fatal)', async () => {
      media.findByIdInStore.mockResolvedValue(createdRow({ storagePath: 'store-1/media-1' }));
      media.countProductMediaReferences.mockResolvedValue(0);
      media.deleteByIdInStore.mockResolvedValue({ count: 1 });
      storage.deleteObject.mockRejectedValue(new StorageError('Media storage is unavailable.'));

      await expect(service.deleteMedia('media-1')).resolves.toBeUndefined();
      expect(storage.deleteObject).toHaveBeenCalledWith('store-1/media-1');
    });
  });
});
