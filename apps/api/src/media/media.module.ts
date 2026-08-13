import { Module } from '@nestjs/common';
import { MediaController } from './controllers/media.controller';
import { MediaRepository } from './repositories/media.repository';
import { MediaService } from './services/media.service';
import { StorageProvider } from './storage/storage-provider';
import { SupabaseStorageProvider } from './storage/supabase-storage-provider';

/**
 * Media module (roadmap Phase 13).
 *
 * Implements the merchant Media API (docs/API-SPEC.md §29) on top of the
 * FINAL schema (media, product_media), the Phase 1/2 foundation (authentication
 * boundary, tenant context, transaction helper, RLS binder) and Supabase
 * Storage for binaries.
 *
 *   Controller -> Service -> Repository -> Database
 *   Service -> StorageProvider (Supabase Storage)
 *
 * Business rules live in the service/domain layer; controllers stay thin.
 * Storage credentials are server-side only and are never logged.
 */
@Module({
  controllers: [MediaController],
  providers: [
    MediaService,
    MediaRepository,
    { provide: StorageProvider, useClass: SupabaseStorageProvider },
  ],
})
export class MediaModule {}
