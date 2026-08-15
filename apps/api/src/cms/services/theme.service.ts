import { Injectable } from '@nestjs/common';
import { Prisma, ThemeConfiguration } from '@prisma/client';
import { RequestContextService } from '../../common/context/request-context.service';
import { NotFoundError } from '../../common/errors/domain-exceptions';
import { requireStoreId } from '../../catalog/domain/catalog-tenant';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { buildThemeConfig, DEFAULT_THEME_CONFIG } from '../domain/cms-theme';
import { UpdateThemeDto } from '../dto/update-theme.dto';
import { ThemeRepository } from '../repositories/theme.repository';
import { ThemeView, toThemeView } from '../cms.types';
import { CmsAuditService } from './cms-audit.service';

/** Audit action for theme configuration changes (DATABASE §21.3). */
const AUDIT_ACTION_THEME_UPDATED = 'theme.updated';

/**
 * Theme / store-branding application service (docs/API-SPEC.md §28,
 * docs/DOMAIN-MODEL.md §14.4, docs/DATABASE.md §7.24).
 *
 * Business rules implemented here:
 *
 * - The theme is 1:1 with the Store (UNIQUE store_id) and is "Created
 *   automatically with the Store (default theme)" (DATABASE §7.24). The
 *   Phase 2 store creation predates the CMS module; this service therefore
 *   materializes the default row lazily (get-or-create) so the documented
 *   invariant always holds.
 * - The config JSONB stores the documented API-SPEC §28 properties
 *   (primaryColor, fontFamily); PUT replaces the stored config.
 * - `logoMediaId` references a Media row of the SAME store
 *   (theme_configurations.logo_media_id — DATABASE §7.24); the reference is
 *   validated store-scoped and fails closed (NOT_FOUND) when the media row
 *   does not exist in the store. Binary uploads are a Media-phase concern.
 * - Administrative changes are audited (DATABASE §21.3/§25.1).
 */
@Injectable()
export class ThemeService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly themes: ThemeRepository,
    private readonly transaction: TransactionService,
    private readonly audit: CmsAuditService,
  ) {}

  /**
   * GET /api/v1/theme — the store's theme configuration (default when absent).
   *
   * `storeId` is optional: the merchant path resolves it from the trusted
   * tenant context; the public storefront path passes the store resolved
   * SERVER-SIDE by the StorefrontStoreResolver (never client input).
   */
  async getTheme(storeId?: string): Promise<ThemeView> {
    const resolvedStoreId = storeId ?? requireStoreId(this.requestContext);

    const existing = await this.themes.findByStoreId(resolvedStoreId);
    if (existing) {
      return toThemeView(existing);
    }

    const created = await this.transaction.runWithTenant(resolvedStoreId, (tx) =>
      this.themes.create(tx, {
        storeId: resolvedStoreId,
        config: DEFAULT_THEME_CONFIG,
      }),
    );
    return toThemeView(created);
  }

  /**
   * PUT /api/v1/theme — replaces the theme config (primaryColor, fontFamily),
   * updates the store-logo reference when provided, and audits the change.
   */
  async updateTheme(dto: UpdateThemeDto): Promise<ThemeView> {
    const storeId = requireStoreId(this.requestContext);

    const config = buildThemeConfig({
      primaryColor: dto.primaryColor,
      fontFamily: dto.fontFamily,
    });

    const updated = await this.transaction.runWithTenant(storeId, async (tx) => {
      const existing = await this.themes.findByStoreIdTx(tx, storeId);
      const theme = await this.resolveRow(tx, storeId, existing, config, dto.logoMediaId);

      await this.audit.write(
        tx,
        storeId,
        AUDIT_ACTION_THEME_UPDATED,
        'theme_configuration',
        theme.id,
        {
          config,
          ...(dto.logoMediaId !== undefined ? { logoMediaId: dto.logoMediaId } : {}),
        },
      );
      return theme;
    });

    return toThemeView(updated);
  }

  private async resolveRow(
    tx: Prisma.TransactionClient,
    storeId: string,
    existing: ThemeConfiguration | null,
    config: Record<string, string>,
    logoMediaId?: string,
  ): Promise<ThemeConfiguration> {
    if (logoMediaId !== undefined) {
      const media = await this.themes.findMediaInStore(tx, storeId, logoMediaId);
      if (!media) {
        throw new NotFoundError('The media asset was not found.');
      }
    }

    const data = {
      config: config as Prisma.InputJsonValue,
      ...(logoMediaId !== undefined ? { logoMediaId } : {}),
    };

    if (existing) {
      const result = await this.themes.update(tx, storeId, existing.id, data);
      if (result.count === 0) {
        throw new NotFoundError('The theme configuration was not found.');
      }
      return {
        ...existing,
        config: data.config as Prisma.JsonValue,
        ...(logoMediaId !== undefined ? { logoMediaId } : {}),
      };
    }
    return this.themes.create(tx, {
      storeId,
      ...data,
    });
  }
}
