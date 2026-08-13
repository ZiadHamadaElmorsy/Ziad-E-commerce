import { Injectable } from '@nestjs/common';
import { Inventory, MovementType, Prisma } from '@prisma/client';
import { requireStoreId } from '../../catalog/domain/catalog-tenant';
import { ProductVariantRepository } from '../../catalog/repositories/product-variant.repository';
import { RequestContextService } from '../../common/context/request-context.service';
import {
  InsufficientInventoryError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/domain-exceptions';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { AdjustInventoryDto } from '../dto/adjust-inventory.dto';
import { ListMovementsQueryDto } from '../dto/list-movements-query.dto';
import { mapInventoryWriteError } from '../domain/inventory-error.mapper';
import { InventoryMovementRepository } from '../repositories/inventory-movement.repository';
import { InventoryRepository } from '../repositories/inventory.repository';
import {
  buildPaginationMeta,
  InventoryView,
  MovementView,
  PaginatedView,
  toInventoryView,
  toMovementView,
} from '../inventory.types';

/**
 * Inventory application service (docs/API-SPEC.md §19).
 *
 * Business rules implemented here (docs/DOMAIN-MODEL.md §8.1, docs/DATABASE.md
 * §13/§28.5, docs/MVP-SCOPE.md §11):
 *
 * - Inventory belongs to a ProductVariant (1:1) and is store-scoped through
 *   the variant. Every operation first resolves the variant in the trusted
 *   tenant (reusing the Catalog ProductVariantRepository — variant ownership
 *   rules are never duplicated).
 * - available = on_hand - reserved (derived, never stored).
 * - Inventory rows are initialized EXPLICITLY by the merchant via the adjust
 *   endpoint (MVP-SCOPE "Set initial inventory"; the Catalog module does not
 *   create inventory). The first adjustment creates the row and records an
 *   INITIAL_STOCK movement; later adjustments record ADJUSTMENT movements
 *   (docs/DATABASE.md §13.5/§28.5 — both types are valid for on_hand deltas).
 * - The adjust quantity is a SIGNED delta. Negative deltas that would break
 *   the FINAL invariant (on_hand + delta >= reserved) are rejected by the
 *   atomic guarded UPDATE (zero rows affected -> insufficient inventory).
 * - Every adjustment writes an immutable inventory_movements row with the
 *   post-change snapshots in the SAME transaction (docs/DATABASE.md §28.5).
 */
@Injectable()
export class InventoryService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly variants: ProductVariantRepository,
    private readonly inventory: InventoryRepository,
    private readonly movements: InventoryMovementRepository,
    private readonly transaction: TransactionService,
  ) {}

  /**
   * GET /api/v1/variants/:variantId/inventory
   *
   * Returns the current inventory state. A variant outside the current store
   * or a variant that has never been initialized (no inventory row yet) fails
   * closed with NOT_FOUND — a missing row is never silently rendered as zero.
   */
  async getInventory(variantId: string): Promise<InventoryView> {
    const storeId = requireStoreId(this.requestContext);

    await this.requireVariantInStore(storeId, variantId);

    const inventory = await this.inventory.findByVariant(storeId, variantId);
    if (!inventory) {
      throw new NotFoundError('No inventory has been set for this variant.');
    }

    return toInventoryView(inventory);
  }

  /**
   * POST /api/v1/variants/:variantId/inventory/adjust
   *
   * Applies a signed delta to on_hand_quantity and records an append-only
   * movement (INITIAL_STOCK on row creation, ADJUSTMENT otherwise) in the
   * same tenant-bound transaction (docs/DATABASE.md §28.5).
   */
  async adjust(variantId: string, dto: AdjustInventoryDto): Promise<InventoryView> {
    const storeId = requireStoreId(this.requestContext);

    if (dto.quantity === 0) {
      throw new ValidationError('An inventory adjustment quantity cannot be zero.');
    }

    await this.requireVariantInStore(storeId, variantId);

    try {
      const inventory = await this.adjustInTransaction(storeId, variantId, dto);
      return toInventoryView(inventory);
    } catch (error) {
      // Race: a concurrent "first adjustment" created the inventory row between
      // our in-transaction existence check and the insert (UNIQUE variant_id).
      // The failed transaction rolled back cleanly — retry once against the
      // now-existing row (only possible when delta >= 0, the creation branch).
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        dto.quantity >= 0
      ) {
        return toInventoryView(await this.adjustInTransaction(storeId, variantId, dto));
      }
      throw mapInventoryWriteError(error);
    }
  }

  /**
   * GET /api/v1/variants/:variantId/inventory/movements
   *
   * Append-only movement history for the variant, newest first, paginated per
   * docs/API-SPEC.md §7/§10.
   */
  async listMovements(
    variantId: string,
    query: ListMovementsQueryDto,
  ): Promise<PaginatedView<MovementView>> {
    const storeId = requireStoreId(this.requestContext);

    await this.requireVariantInStore(storeId, variantId);

    const skip = (query.page - 1) * query.limit;
    const [movements, total] = await Promise.all([
      this.movements.findByVariant(storeId, variantId, skip, query.limit),
      this.movements.countByVariant(storeId, variantId),
    ]);

    return {
      items: movements.map(toMovementView),
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  /** One tenant-bound transaction: inventory update + movement (no partial commits). */
  private async adjustInTransaction(
    storeId: string,
    variantId: string,
    dto: AdjustInventoryDto,
  ): Promise<Inventory> {
    return this.transaction.runWithTenant(storeId, async (tx) => {
      const existing = await this.inventory.findByVariantTx(tx, storeId, variantId);

      let movementType: MovementType;
      if (existing) {
        movementType = MovementType.ADJUSTMENT;
        const { count } = await this.inventory.guardedAdjust(tx, storeId, variantId, dto.quantity);
        if (count === 0) {
          // Zero rows affected -> rejected (would go negative / below reserved).
          throw new InsufficientInventoryError(
            'The adjustment would make on-hand quantity negative or below the reserved quantity.',
          );
        }
      } else {
        // Explicit initial stock (docs/MVP-SCOPE §11 "Set initial inventory";
        // API-SPEC §19 example reason "INITIAL_STOCK"). The row's on_hand must
        // start non-negative; a negative first delta is rejected up front.
        if (dto.quantity < 0) {
          throw new InsufficientInventoryError(
            'Initial stock cannot be set below zero; add stock before reducing it.',
          );
        }
        movementType = MovementType.INITIAL_STOCK;
        await this.inventory.create(tx, {
          storeId,
          variantId,
          onHandQuantity: dto.quantity,
        });
      }

      // Post-change snapshot from the authoritative row (read within the same
      // transaction, after the row lock was taken by the guarded update).
      const current = await this.inventory.findByVariantTx(tx, storeId, variantId);
      if (!current) {
        throw new NotFoundError('The inventory row could not be found.');
      }

      await this.movements.create(tx, {
        storeId,
        variantId,
        movementType,
        quantity: dto.quantity,
        referenceType: 'adjustment',
        referenceId: null,
        reason: dto.reason,
        onHandAfter: current.onHandQuantity,
        reservedAfter: current.reservedQuantity,
      });

      return current;
    });
  }

  /** Resolves the variant in the current store (variant ownership, §16). */
  private async requireVariantInStore(storeId: string, variantId: string): Promise<void> {
    const variant = await this.variants.findById(storeId, variantId);
    if (!variant) {
      throw new NotFoundError('The variant was not found.');
    }
  }
}
