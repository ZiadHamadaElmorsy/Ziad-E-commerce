import { Injectable } from '@nestjs/common';
import { Inventory, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Minimal write input for creating an Inventory row (docs/DATABASE.md §7.9). */
export interface CreateInventoryInput {
  storeId: string;
  variantId: string;
  onHandQuantity: number;
}

/**
 * Persistence access for the `inventory` table (docs/DATABASE.md §7.9/§13).
 *
 * The four quantity mutations are implemented as single-statement atomic
 * guarded UPDATEs (docs/DATABASE.md §13.3) executed with raw SQL because the
 * availability guard compares two COLUMNS (`on_hand - reserved`), which
 * Prisma's `updateMany` cannot express. This is the documented anti-race
 * contract: NO read-then-write availability decision exists anywhere.
 *
 * Every statement is store-scoped (store_id + variant_id) and runs on the
 * tenant-bound transaction client, so RLS sees the correct tenant.
 */
@Injectable()
export class InventoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Store-scoped inventory read (shared client). */
  async findByVariant(storeId: string, variantId: string): Promise<Inventory | null> {
    return this.prisma.inventory.findUnique({
      where: { storeId_variantId: { storeId, variantId } },
    });
  }

  /**
   * Store-scoped batch read for a product's variants (Phase 25 — performance
   * audit). Returns ONLY variants that have an inventory row; variants that
   * were never initialized are intentionally absent (the merchant dashboard
   * renders those as "—"/not-set).
   */
  async findManyByVariantIds(storeId: string, variantIds: string[]): Promise<Inventory[]> {
    if (variantIds.length === 0) {
      return [];
    }
    return this.prisma.inventory.findMany({
      where: { storeId, variantId: { in: variantIds } },
    });
  }

  /** Store-scoped inventory read inside the caller's transaction. */
  async findByVariantTx(
    tx: Prisma.TransactionClient,
    storeId: string,
    variantId: string,
  ): Promise<Inventory | null> {
    return tx.inventory.findUnique({
      where: { storeId_variantId: { storeId, variantId } },
    });
  }

  /**
   * Creates the inventory row (explicit initial-stock path). `reserved_quantity`
   * defaults to 0 (schema default). The composite store-scoped FK and the
   * UNIQUE(variant_id) index are the final safety boundaries.
   */
  async create(tx: Prisma.TransactionClient, data: CreateInventoryInput): Promise<Inventory> {
    return tx.inventory.create({
      data: {
        storeId: data.storeId,
        variantId: data.variantId,
        onHandQuantity: data.onHandQuantity,
      },
    });
  }

  /**
   * (1) Manual adjustment / stock in (docs/DATABASE.md §13.3):
   *
   *   UPDATE inventory
   *      SET on_hand_quantity = on_hand_quantity + delta
   *    WHERE store_id = ? AND variant_id = ?
   *      AND on_hand_quantity + delta >= reserved_quantity;
   *
   * Zero rows affected -> rejected (would make on_hand negative or below the
   * reserved quantity, breaking the FINAL CHECK (on_hand >= reserved)).
   */
  async guardedAdjust(
    tx: Prisma.TransactionClient,
    storeId: string,
    variantId: string,
    delta: number,
  ): Promise<{ count: number }> {
    const count = await tx.$executeRaw`
      UPDATE "inventory"
         SET "on_hand_quantity" = "on_hand_quantity" + ${delta}::int,
             "updated_at" = now()
       WHERE "store_id" = ${storeId}::uuid
         AND "variant_id" = ${variantId}::uuid
         AND "on_hand_quantity" + ${delta}::int >= "reserved_quantity"`;
    return { count };
  }

  /**
   * (2) Reservation (docs/DATABASE.md §13.3):
   *
   *   UPDATE inventory
   *      SET reserved_quantity = reserved_quantity + qty
   *    WHERE store_id = ? AND variant_id = ?
   *      AND on_hand_quantity - reserved_quantity >= qty;
   *
   * Zero rows affected -> insufficient stock (no reservation is created).
   */
  async guardedReserve(
    tx: Prisma.TransactionClient,
    storeId: string,
    variantId: string,
    quantity: number,
  ): Promise<{ count: number }> {
    const count = await tx.$executeRaw`
      UPDATE "inventory"
         SET "reserved_quantity" = "reserved_quantity" + ${quantity}::int,
             "updated_at" = now()
       WHERE "store_id" = ${storeId}::uuid
         AND "variant_id" = ${variantId}::uuid
         AND "on_hand_quantity" - "reserved_quantity" >= ${quantity}::int`;
    return { count };
  }

  /**
   * (3) Consumption (docs/DATABASE.md §13.3):
   *
   *   UPDATE inventory
   *      SET on_hand_quantity = on_hand_quantity - qty,
   *          reserved_quantity = reserved_quantity - qty
   *    WHERE store_id = ? AND variant_id = ?;
   *
   * Only invoked AFTER the reservation ACTIVE -> CONSUMED transition applied
   * (the reservation's quantity is still part of `reserved`), so no
   * availability guard is needed — the CHECK constraints are the final guard.
   */
  async guardedConsume(
    tx: Prisma.TransactionClient,
    storeId: string,
    variantId: string,
    quantity: number,
  ): Promise<{ count: number }> {
    const count = await tx.$executeRaw`
      UPDATE "inventory"
         SET "on_hand_quantity" = "on_hand_quantity" - ${quantity}::int,
             "reserved_quantity" = "reserved_quantity" - ${quantity}::int,
             "updated_at" = now()
       WHERE "store_id" = ${storeId}::uuid
         AND "variant_id" = ${variantId}::uuid`;
    return { count };
  }

  /**
   * (4) Release (docs/DATABASE.md §13.3):
   *
   *   UPDATE inventory
   *      SET reserved_quantity = reserved_quantity - qty
   *    WHERE store_id = ? AND variant_id = ?;
   *
   * Only invoked AFTER the reservation ACTIVE -> RELEASED transition applied.
   */
  async guardedRelease(
    tx: Prisma.TransactionClient,
    storeId: string,
    variantId: string,
    quantity: number,
  ): Promise<{ count: number }> {
    const count = await tx.$executeRaw`
      UPDATE "inventory"
         SET "reserved_quantity" = "reserved_quantity" - ${quantity}::int,
             "updated_at" = now()
       WHERE "store_id" = ${storeId}::uuid
         AND "variant_id" = ${variantId}::uuid`;
    return { count };
  }
}
