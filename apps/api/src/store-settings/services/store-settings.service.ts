import { Injectable } from '@nestjs/common';
import { requireStoreId } from '../../catalog/domain/catalog-tenant';
import { RequestContextService } from '../../common/context/request-context.service';
import { TenantContextRequiredError } from '../../common/errors/domain-exceptions';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import {
  normalizeWhatsAppPhone,
  validateWhatsAppSettings,
  WhatsAppSettings,
  whatsAppSettingsFromJson,
  whatsAppSettingsToJson,
} from '../domain/whatsapp-config';
import { UpdateWhatsAppSettingsDto } from '../dto/update-whatsapp-settings.dto';
import { StoreSettingsRepository } from '../repositories/store-settings.repository';

/**
 * Store-settings application service (Phase 22 — WhatsApp ordering config).
 *
 * The store id ALWAYS comes from the trusted tenant context (membership ->
 * store) on the merchant path, or from the resolved storefront on the public
 * path. A client never supplies a store id, so Merchant A can never read or
 * modify Merchant B's WhatsApp configuration (tenant isolation by
 * construction; RLS remains the final defense).
 */
@Injectable()
export class StoreSettingsService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly settings: StoreSettingsRepository,
    private readonly transaction: TransactionService,
  ) {}

  /** GET /stores/current/settings/whatsapp — current merchant's configuration. */
  async getWhatsAppSettingsForCurrentStore(): Promise<{ whatsapp: WhatsAppSettings }> {
    const storeId = this.tenantStoreId();
    return { whatsapp: await this.readWhatsAppSettings(storeId) };
  }

  /** PUT /stores/current/settings/whatsapp — update the current store's config. */
  async updateWhatsAppSettingsForCurrentStore(
    dto: UpdateWhatsAppSettingsDto,
  ): Promise<{ whatsapp: WhatsAppSettings }> {
    const storeId = this.tenantStoreId();

    const normalized: WhatsAppSettings = {
      enabled: dto.whatsapp.enabled,
      phoneNumber: normalizeWhatsAppPhone(dto.whatsapp.phoneNumber),
      label: dto.whatsapp.label?.trim() ? dto.whatsapp.label.trim() : null,
    };
    // Enabled with an invalid/empty number is a domain error (fail closed).
    validateWhatsAppSettings(normalized);

    const updated = await this.transaction.runWithTenant(storeId, async (tx) => {
      await this.settings.upsert(tx, storeId, whatsAppSettingsToJson(normalized));
      return this.settings.findByStoreIdTx(tx, storeId);
    });

    const persisted = updated?.settings;
    return { whatsapp: whatsAppSettingsFromJson(persisted) };
  }

  /** Public read — used by the storefront and the WhatsApp order flow. */
  async readWhatsAppSettings(storeId: string): Promise<WhatsAppSettings> {
    const row = await this.settings.findByStoreId(storeId);
    return whatsAppSettingsFromJson(row?.settings);
  }

  private tenantStoreId(): string {
    try {
      return requireStoreId(this.requestContext);
    } catch {
      throw new TenantContextRequiredError('A store tenant context is required.');
    }
  }
}
