import { Injectable } from '@nestjs/common';
import { InventoryReservation, Prisma, ReservationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Minimal write input for creating a reservation (docs/DATABASE.md §7.10). */
export interface CreateReservationInput {
  storeId: string;
  variantId: string;
  cartId?: string | null;
  orderId?: string | null;
  quantity: number;
  expiresAt?: Date | null;
}

/**
 * Persistence access for the `inventory_reservations` table
 * (docs/DATABASE.md §7.10/§14).
 *
 * Reservation rows are NEVER deleted in the MVP; they are the audit trail of
 * the reservation lifecycle (CONSUMED/RELEASED rows are retained).
 *
 * Lifecycle (exactly): ACTIVE -> CONSUMED or ACTIVE -> RELEASED. EXPIRED /
 * CONVERTED are NOT states. Terminal transitions use the guarded conditional
 * UPDATE (WHERE status = 'ACTIVE') so release/consumption are idempotent and
 * concurrency-safe (docs/DATABASE.md §14.3, §26.2).
 */
@Injectable()
export class InventoryReservationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tx: Prisma.TransactionClient,
    data: CreateReservationInput,
  ): Promise<InventoryReservation> {
    return tx.inventoryReservation.create({
      data: {
        storeId: data.storeId,
        variantId: data.variantId,
        quantity: data.quantity,
        ...(data.cartId !== undefined ? { cartId: data.cartId } : {}),
        ...(data.orderId !== undefined ? { orderId: data.orderId } : {}),
        ...(data.expiresAt !== undefined ? { expiresAt: data.expiresAt } : {}),
      },
    });
  }

  /** Store-scoped read (shared client) — cross-tenant lookups fail closed. */
  async findById(storeId: string, reservationId: string): Promise<InventoryReservation | null> {
    return this.prisma.inventoryReservation.findFirst({
      where: { id: reservationId, storeId },
    });
  }

  /** Store-scoped read inside the caller's transaction. */
  async findByIdTx(
    tx: Prisma.TransactionClient,
    storeId: string,
    reservationId: string,
  ): Promise<InventoryReservation | null> {
    return tx.inventoryReservation.findFirst({
      where: { id: reservationId, storeId },
    });
  }

  /**
   * Concurrency-safe terminal transition (docs/DATABASE.md §14.3):
   *
   *   UPDATE inventory_reservations
   *      SET status = ?, released_at/consumed_at = now()
   *    WHERE id = ? AND store_id = ? AND status = 'ACTIVE';
   *
   * Only when the UPDATE affects exactly one row may the caller decrement
   * inventory. A repeated call sees status != 'ACTIVE', affects zero rows and
   * performs no decrement — release/consumption are therefore idempotent.
   */
  async transitionStatus(
    tx: Prisma.TransactionClient,
    storeId: string,
    reservationId: string,
    from: ReservationStatus,
    to: ReservationStatus,
  ): Promise<{ count: number }> {
    return tx.inventoryReservation.updateMany({
      where: { id: reservationId, storeId, status: from },
      data: {
        status: to,
        ...(to === ReservationStatus.RELEASED ? { releasedAt: new Date() } : {}),
        ...(to === ReservationStatus.CONSUMED ? { consumedAt: new Date() } : {}),
      },
    });
  }

  /**
   * Expired ACTIVE reservations for the expiration sweep — bounded batch,
   * ordered by expiry, backed by the (store_id, status, expires_at) index
   * (docs/DATABASE.md §14.2/§28.6).
   */
  async findDueForExpiration(
    storeId: string,
    now: Date,
    take: number,
  ): Promise<InventoryReservation[]> {
    return this.prisma.inventoryReservation.findMany({
      where: { storeId, status: ReservationStatus.ACTIVE, expiresAt: { lte: now } },
      orderBy: { expiresAt: 'asc' },
      take,
    });
  }

  /**
   * Links the ACTIVE reservations created during checkout to the created order
   * (docs/DATABASE.md §28.1 step 5 — "Link reservations to order_id").
   * Called by the Checkout phase AFTER the order exists, inside the same
   * tenant-bound transaction. Returns the affected row count.
   */
  async linkOrderForCart(
    tx: Prisma.TransactionClient,
    storeId: string,
    cartId: string,
    orderId: string,
  ): Promise<{ count: number }> {
    return tx.inventoryReservation.updateMany({
      where: { storeId, cartId, orderId: null },
      data: { orderId },
    });
  }

  /**
   * ACTIVE reservations linked to an order (docs/DATABASE.md §14.4 — after
   * order creation, order_id is the authoritative link for release on order
   * outcomes). Used by the Orders phase cancellation path (§28.4: "release
   * any ACTIVE reservations") inside the caller's tenant-bound transaction.
   */
  async findActiveByOrderTx(
    tx: Prisma.TransactionClient,
    storeId: string,
    orderId: string,
  ): Promise<InventoryReservation[]> {
    return tx.inventoryReservation.findMany({
      where: { storeId, orderId, status: ReservationStatus.ACTIVE },
    });
  }
}
