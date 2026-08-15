import { Injectable } from '@nestjs/common';
import { Prisma, StoreSettings } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Persistence access for the existing `store_settings` table (DATABASE §7.21).
 *
 * The table already exists with a JSONB `settings` column and a UNIQUE
 * `store_id` — no schema change is needed for store-scoped WhatsApp
 * configuration. Reads use the shared client; the upsert participates in the
 * caller's tenant-bound transaction.
 */
@Injectable()
export class StoreSettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Store-scoped read (one settings row per store). */
  async findByStoreId(storeId: string): Promise<StoreSettings | null> {
    return this.prisma.storeSettings.findUnique({ where: { storeId } });
  }

  /** Reads inside a transaction (tenant-bound). */
  async findByStoreIdTx(tx: Prisma.TransactionClient, storeId: string): Promise<StoreSettings | null> {
    return tx.storeSettings.findUnique({ where: { storeId } });
  }

  /**
   * Inserts the row or updates the existing one. `store_id` is UNIQUE, so
   * concurrent first-writes are safe (upsert semantics).
   */
  async upsert(
    tx: Prisma.TransactionClient,
    storeId: string,
    settings: Record<string, unknown>,
  ): Promise<StoreSettings> {
    return tx.storeSettings.upsert({
      where: { storeId },
      create: { storeId, settings: settings as Prisma.InputJsonValue },
      update: { settings: settings as Prisma.InputJsonValue },
    });
  }
}
