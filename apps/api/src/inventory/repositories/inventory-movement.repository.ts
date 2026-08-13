import { Injectable } from '@nestjs/common';
import { InventoryMovement, MovementType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Minimal write input for an immutable movement row (docs/DATABASE.md §7.11). */
export interface CreateMovementInput {
  storeId: string;
  variantId: string;
  movementType: MovementType;
  /** Signed delta (see docs/DATABASE.md §13.5 for the target counter). */
  quantity: number;
  referenceType?: string | null;
  referenceId?: string | null;
  reason?: string | null;
  /** Post-change snapshots — movements are self-contained audit records. */
  onHandAfter: number;
  reservedAfter: number;
}

/**
 * Persistence access for the `inventory_movements` table (docs/DATABASE.md
 * §7.11/§13.5).
 *
 * Append-only: rows are NEVER updated or deleted. The snapshot columns
 * (on_hand_after / reserved_after) represent the resulting inventory state
 * after the mutation.
 */
@Injectable()
export class InventoryMovementRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tx: Prisma.TransactionClient,
    data: CreateMovementInput,
  ): Promise<InventoryMovement> {
    return tx.inventoryMovement.create({
      data: {
        storeId: data.storeId,
        variantId: data.variantId,
        movementType: data.movementType,
        quantity: data.quantity,
        onHandAfter: data.onHandAfter,
        reservedAfter: data.reservedAfter,
        ...(data.referenceType !== undefined ? { referenceType: data.referenceType } : {}),
        ...(data.referenceId !== undefined ? { referenceId: data.referenceId } : {}),
        ...(data.reason !== undefined ? { reason: data.reason } : {}),
      },
    });
  }

  /** Store-scoped movement history (newest first). */
  async findByVariant(
    storeId: string,
    variantId: string,
    skip: number,
    take: number,
  ): Promise<InventoryMovement[]> {
    return this.prisma.inventoryMovement.findMany({
      where: { storeId, variantId },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  async countByVariant(storeId: string, variantId: string): Promise<number> {
    return this.prisma.inventoryMovement.count({ where: { storeId, variantId } });
  }
}
