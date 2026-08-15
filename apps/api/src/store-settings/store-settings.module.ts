import { Module } from '@nestjs/common';
import { StoreSettingsController } from './controllers/store-settings.controller';
import { StoreSettingsRepository } from './repositories/store-settings.repository';
import { StoreSettingsService } from './services/store-settings.service';

/**
 * Store settings module (Phase 22 — WhatsApp ordering configuration).
 *
 * Implements the merchant WhatsApp settings API and exposes the same
 * store-scoped read to the public storefront/WhatsApp order flow:
 *
 *   GET /api/v1/stores/current/settings/whatsapp
 *   PUT /api/v1/stores/current/settings/whatsapp
 *
 * The configuration lives in the EXISTING `store_settings` table (JSONB
 * `settings` column, UNIQUE store_id) — no new table, no new tenant model.
 * The tenant is always the trusted context (membership on the merchant path,
 * StorefrontStoreResolver on the public path).
 */
@Module({
  controllers: [StoreSettingsController],
  providers: [StoreSettingsService, StoreSettingsRepository],
  exports: [StoreSettingsService],
})
export class StoreSettingsModule {}
