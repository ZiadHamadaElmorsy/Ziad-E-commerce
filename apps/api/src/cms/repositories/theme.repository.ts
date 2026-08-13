import { Injectable } from '@nestjs/common';
import { Media, Prisma, ThemeConfiguration } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Minimal write input for creating a ThemeConfiguration (docs/DATABASE.md §7.24). */
export interface CreateThemeInput {
  storeId: string;
  config: Prisma.InputJsonValue;
}

/** Minimal write input for updating the 1:1 theme configuration. */
export interface UpdateThemeInput {
  config?: Prisma.InputJsonValue;
  logoMediaId?: string | null;
}

/**
 * Persistence access for the `theme_configurations` table (1:1 with Store,
 * `UNIQUE (store_id)`).
 *
 * DATABASE §7.24: the theme row is "Created automatically with the Store
 * (default theme)". The Phase 2 store creation predates the CMS module and
 * does not create it; the CMS service therefore materializes the default row
 * lazily (get-or-create), which preserves the documented invariant without
 * rewriting the Phase 2 flow. Writes are store-scoped (updateMany WHERE id +
 * storeId) so cross-tenant updates are impossible even with a leaked id.
 */
@Injectable()
export class ThemeRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The store's theme configuration (the storeId unique 1:1). */
  async findByStoreId(storeId: string): Promise<ThemeConfiguration | null> {
    return this.prisma.themeConfiguration.findUnique({ where: { storeId } });
  }

  /** Transaction-scoped variant of {@link findByStoreId}. */
  async findByStoreIdTx(
    tx: Prisma.TransactionClient,
    storeId: string,
  ): Promise<ThemeConfiguration | null> {
    return tx.themeConfiguration.findUnique({ where: { storeId } });
  }

  async create(tx: Prisma.TransactionClient, data: CreateThemeInput): Promise<ThemeConfiguration> {
    return tx.themeConfiguration.create({ data: { ...data } });
  }

  /** Store-scoped guarded update (0 rows = theme not found). */
  async update(
    tx: Prisma.TransactionClient,
    storeId: string,
    themeId: string,
    data: UpdateThemeInput,
  ): Promise<{ count: number }> {
    return tx.themeConfiguration.updateMany({
      where: { id: themeId, storeId },
      data,
    });
  }

  /**
   * Store-scoped existence check for a Media row (theme logo reference —
   * DATABASE §7.24). Media management itself is Phase 13; this phase only
   * manages the reference and fails closed when it does not exist in the
   * current store.
   */
  async findMediaInStore(
    tx: Prisma.TransactionClient,
    storeId: string,
    mediaId: string,
  ): Promise<Media | null> {
    return tx.media.findFirst({
      where: { id: mediaId, storeId },
    });
  }
}
