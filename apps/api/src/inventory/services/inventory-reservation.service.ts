import { Injectable } from '@nestjs/common';
import {
  InventoryReservation,
  MovementType,
  Prisma,
  ReservationStatus,
  VariantStatus,
} from '@prisma/client';
import { requireStoreId } from '../../catalog/domain/catalog-tenant';
import { ProductVariantRepository } from '../../catalog/repositories/product-variant.repository';
import { RequestContextService } from '../../common/context/request-context.service';
import {
  ConflictError,
  InsufficientInventoryError,
  NotFoundError,
  StateTransitionError,
  ValidationError,
} from '../../common/errors/domain-exceptions';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import {
  invalidTerminalTransitionMessage,
  resolveTerminalTransition,
  TerminalReservationStatus,
} from '../domain/reservation-lifecycle';
import { mapInventoryWriteError } from '../domain/inventory-error.mapper';
import { InventoryMovementRepository } from '../repositories/inventory-movement.repository';
import { InventoryReservationRepository } from '../repositories/inventory-reservation.repository';
import { InventoryRepository } from '../repositories/inventory.repository';
import { ReservationView, toReservationView } from '../inventory.types';

/**
 * Reservation application service — the inventory-side integration boundary
 * for the checkout / payment / order-cancellation phases.
 *
 * docs/API-SPEC.md §19 defines NO reservation endpoints, so these operations
 * are exposed as services only (no controller). Business rules follow
 * docs/DOMAIN-MODEL.md §8.2 and docs/DATABASE.md §14 exactly:
 *
 *   ACTIVE -> CONSUMED   (verified payment success)
 *   ACTIVE -> RELEASED   (payment failure, order cancellation, or expiration)
 *
 * - RESERVE: atomic guarded `reserved + qty WHERE available >= qty`; the
 *   ACTIVE reservation row and the RESERVATION movement are written in the
 *   same transaction. Zero rows affected -> INSUFFICIENT_INVENTORY and NO
 *   reservation is created (docs/DATABASE.md §13.3/§13.4).
 * - CONSUME/RELEASE: the guarded `WHERE status = 'ACTIVE'` transition runs
 *   FIRST; inventory is decremented and the movement written ONLY when the
 *   transition affected exactly one row (§14.3/§27.2). Repeated execution is
 *   an idempotent no-op. Release/consume of the OTHER terminal state is
 *   forbidden (STATE_TRANSITION).
 * - Expiration is a RELEASE path, not a state: expired ACTIVE reservations
 *   are transitioned ACTIVE -> RELEASED by the sweep (§14.2/§28.6), which is
 *   per-reservation idempotent and retryable. EXPIRED/CONVERTED do not exist.
 */
@Injectable()
export class InventoryReservationService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly variants: ProductVariantRepository,
    private readonly inventory: InventoryRepository,
    private readonly reservations: InventoryReservationRepository,
    private readonly movements: InventoryMovementRepository,
    private readonly transaction: TransactionService,
  ) {}

  /**
   * RESERVE (checkout, before payment initiation — docs/DATABASE.md §14.1).
   *
   * @param variantId variant in the current store (must be ACTIVE)
   * @param quantity  positive integer to reserve
   * @param context   at least one of cartId / orderId (DB CHECK requires it)
   * @param expiresAt optional ACTIVE-lifetime bound
   */
  async reserve(
    variantId: string,
    quantity: number,
    context: { cartId?: string | null; orderId?: string | null },
    expiresAt?: Date | null,
  ): Promise<ReservationView> {
    const storeId = requireStoreId(this.requestContext);

    this.assertReservationArgs(quantity, context, expiresAt);

    const variant = await this.variants.findById(storeId, variantId);
    if (!variant) {
      throw new NotFoundError('The variant was not found.');
    }
    // Archived variants must not become sellable through inventory logic
    // (checkout validation: "Variant is available" — docs/MVP-SCOPE §16).
    if (variant.status !== VariantStatus.ACTIVE) {
      throw new StateTransitionError('Stock cannot be reserved for a non-active variant.');
    }

    try {
      const reservation = await this.transaction.runWithTenant(storeId, (tx) =>
        this.reserveTx(tx, storeId, variantId, quantity, context, expiresAt),
      );
      return toReservationView(reservation);
    } catch (error) {
      throw mapInventoryWriteError(error);
    }
  }

  /**
   * RESERVE inside the caller's tenant-bound transaction (docs/DATABASE.md
   * §14.1/§28.1 step 3). The atomic guarded increment is the ONLY availability
   * decision — never a read-then-write check — and the ACTIVE reservation row
   * plus the RESERVATION movement are written in the same unit of work.
   *
   * Exposed for the Checkout phase so reservation creation and order creation
   * share ONE transaction (any step failure rolls everything back). The
   * variant ownership/ACTIVE check is performed by the caller (the checkout
   * revalidation) — this method focuses on the atomic reservation mechanics.
   */
  async reserveTx(
    tx: Prisma.TransactionClient,
    storeId: string,
    variantId: string,
    quantity: number,
    context: { cartId?: string | null; orderId?: string | null },
    expiresAt?: Date | null,
  ): Promise<InventoryReservation> {
    this.assertReservationArgs(quantity, context, expiresAt);

    const { count } = await this.inventory.guardedReserve(tx, storeId, variantId, quantity);
    if (count === 0) {
      throw new InsufficientInventoryError(
        'Insufficient inventory available for this reservation.',
      );
    }

    const created = await this.reservations.create(tx, {
      storeId,
      variantId,
      quantity,
      ...(context.cartId ? { cartId: context.cartId } : {}),
      ...(context.orderId ? { orderId: context.orderId } : {}),
      ...(expiresAt ? { expiresAt } : {}),
    });

    const current = await this.inventory.findByVariantTx(tx, storeId, variantId);
    if (!current) {
      throw new NotFoundError('The inventory row could not be found.');
    }

    await this.movements.create(tx, {
      storeId,
      variantId,
      movementType: MovementType.RESERVATION,
      quantity,
      referenceType: 'reservation',
      referenceId: created.id,
      reason: null,
      onHandAfter: current.onHandQuantity,
      reservedAfter: current.reservedQuantity,
    });

    return created;
  }

  /** Shared reservation-argument validation (quantity / context / expires_at). */
  private assertReservationArgs(
    quantity: number,
    context: { cartId?: string | null; orderId?: string | null },
    expiresAt?: Date | null,
  ): void {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new ValidationError('Reservation quantity must be a positive integer.');
    }
    if (!context.cartId && !context.orderId) {
      throw new ValidationError('A reservation requires a cart or order context (at least one).');
    }
    if (expiresAt !== null && expiresAt !== undefined && expiresAt.getTime() <= Date.now()) {
      throw new ValidationError('Reservation expires_at must be in the future.');
    }
  }

  /** RELEASE (payment failure / cancellation / expiration) — idempotent. */
  async release(reservationId: string): Promise<ReservationView> {
    return this.applyTerminalTransition(reservationId, ReservationStatus.RELEASED);
  }

  /** CONSUME (verified payment success) — idempotent. */
  async consume(reservationId: string): Promise<ReservationView> {
    return this.applyTerminalTransition(reservationId, ReservationStatus.CONSUMED);
  }

  /**
   * Shared guarded ACTIVE -> CONSUMED/RELEASED transition (docs/DATABASE.md
   * §14.3/§27.2): the status transition is applied FIRST; the inventory
   * decrement and the movement happen ONLY when the guarded UPDATE affected
   * exactly one row. This makes release/consumption idempotent AND makes
   * payment-success vs expiration / cancellation vs payment races safe — only
   * one operation may win.
   */
  private async applyTerminalTransition(
    reservationId: string,
    target: TerminalReservationStatus,
  ): Promise<ReservationView> {
    const storeId = requireStoreId(this.requestContext);

    const reservation = await this.reservations.findById(storeId, reservationId);
    if (!reservation) {
      throw new NotFoundError('The reservation was not found.');
    }

    const decision = resolveTerminalTransition(reservation.status, target);

    if (decision.kind === 'noop') {
      // Idempotent repeated execution: already in the target state — no
      // transition, no inventory change, no duplicate movement.
      return toReservationView(reservation);
    }

    if (decision.kind === 'invalid') {
      throw new StateTransitionError(invalidTerminalTransitionMessage(target));
    }

    try {
      const updated = await this.transaction.runWithTenant(storeId, async (tx) => {
        const { count } = await this.reservations.transitionStatus(
          tx,
          storeId,
          reservationId,
          ReservationStatus.ACTIVE,
          target,
        );

        if (count === 0) {
          // A concurrent operation (payment success/failure, expiration sweep)
          // won the guarded transition first. Re-read to resolve the outcome.
          const current = await this.reservations.findByIdTx(tx, storeId, reservationId);
          if (current && current.status === target) {
            return current; // concurrent identical transition -> idempotent no-op
          }
          throw new StateTransitionError(invalidTerminalTransitionMessage(target));
        }

        // The transition applied exactly once -> decrement inventory and write
        // the append-only movement (same transaction, no partial commit).
        const inventoryResult =
          target === ReservationStatus.CONSUMED
            ? await this.inventory.guardedConsume(
                tx,
                storeId,
                reservation.variantId,
                reservation.quantity,
              )
            : await this.inventory.guardedRelease(
                tx,
                storeId,
                reservation.variantId,
                reservation.quantity,
              );

        if (inventoryResult.count === 0) {
          // Consistency anomaly: the reservation exists but its inventory row
          // does not. Fail closed inside the transaction (full rollback).
          throw new ConflictError('The inventory row for the reservation could not be found.');
        }

        const current = await this.inventory.findByVariantTx(tx, storeId, reservation.variantId);
        if (!current) {
          throw new NotFoundError('The inventory row could not be found.');
        }

        await this.movements.create(tx, {
          storeId,
          variantId: reservation.variantId,
          movementType:
            target === ReservationStatus.CONSUMED ? MovementType.CONSUMPTION : MovementType.RELEASE,
          quantity: -reservation.quantity,
          referenceType: 'reservation',
          referenceId: reservationId,
          reason: null,
          onHandAfter: current.onHandQuantity,
          reservedAfter: current.reservedQuantity,
        });

        const updatedReservation = await this.reservations.findByIdTx(tx, storeId, reservationId);
        if (!updatedReservation) {
          throw new NotFoundError('The reservation could not be found.');
        }
        return updatedReservation;
      });

      return toReservationView(updated);
    } catch (error) {
      throw mapInventoryWriteError(error);
    }
  }

  /**
   * Releases every ACTIVE reservation linked to an order inside the CALLER's
   * tenant-bound transaction (docs/DATABASE.md §14.1/§28.4 — order
   * cancellation: "Guard status -> order CANCELLED (cancelled_at) -> release
   * any ACTIVE reservations -> write audit_logs. One transaction.").
   *
   * Each reservation uses the guarded ACTIVE -> RELEASED conditional UPDATE
   * (§14.3/§27.2): the transition is applied FIRST and the reserved-quantity
   * decrement + RELEASE movement happen ONLY when the guarded UPDATE affected
   * exactly one row. A reservation already consumed/released by a concurrent
   * operation is skipped idempotently, so cancellation races against
   * payment-success/expiration are safe.
   *
   * This is a transaction-scoped primitive for the Orders phase — it MUST be
   * called with the same tenant-bound tx that applies the order transition.
   *
   * @returns how many ACTIVE reservations were released
   */
  async releaseAllForOrderTx(
    tx: Prisma.TransactionClient,
    storeId: string,
    orderId: string,
  ): Promise<{ released: number }> {
    const active = await this.reservations.findActiveByOrderTx(tx, storeId, orderId);

    let released = 0;
    for (const reservation of active) {
      const { count } = await this.reservations.transitionStatus(
        tx,
        storeId,
        reservation.id,
        ReservationStatus.ACTIVE,
        ReservationStatus.RELEASED,
      );
      if (count === 0) {
        continue; // concurrent consume/release won; idempotent skip
      }

      const inventoryResult = await this.inventory.guardedRelease(
        tx,
        storeId,
        reservation.variantId,
        reservation.quantity,
      );
      if (inventoryResult.count === 0) {
        throw new ConflictError('The inventory row for the reservation could not be found.');
      }

      const current = await this.inventory.findByVariantTx(tx, storeId, reservation.variantId);
      if (!current) {
        throw new NotFoundError('The inventory row could not be found.');
      }

      await this.movements.create(tx, {
        storeId,
        variantId: reservation.variantId,
        movementType: MovementType.RELEASE,
        quantity: -reservation.quantity,
        referenceType: 'reservation',
        referenceId: reservation.id,
        reason: null,
        onHandAfter: current.onHandQuantity,
        reservedAfter: current.reservedQuantity,
      });

      released += 1;
    }

    return { released };
  }

  /**
   * Consumes every ACTIVE reservation linked to an order inside the CALLER's
   * tenant-bound transaction (docs/DATABASE.md §14.1/§28.2 — verified payment
   * success: "consume reservations (ACTIVE -> CONSUMED; on_hand and reserved
   * decrement) -> order PENDING -> CONFIRMED"). This is the Payments-phase
   * consumption primitive; the Inventory layer remains the sole owner of the
   * reservation lifecycle and inventory quantity mutations.
   *
   * Each reservation uses the guarded ACTIVE -> CONSUMED conditional UPDATE
   * (§14.3/§27.2): the transition is applied FIRST and the on_hand/reserved
   * decrement + CONSUMPTION movement happen ONLY when the guarded UPDATE
   * affected exactly one row. A reservation already consumed/released by a
   * concurrent operation is skipped idempotently, so payment-success races
   * against cancellation/expiration are safe and a retried webhook NEVER
   * decrements inventory twice.
   *
   * This is a transaction-scoped primitive — it MUST be called with the same
   * tenant-bound tx that applies the payment transition.
   *
   * @returns how many ACTIVE reservations were consumed
   */
  async consumeAllForOrderTx(
    tx: Prisma.TransactionClient,
    storeId: string,
    orderId: string,
  ): Promise<{ consumed: number }> {
    const active = await this.reservations.findActiveByOrderTx(tx, storeId, orderId);

    let consumed = 0;
    for (const reservation of active) {
      const { count } = await this.reservations.transitionStatus(
        tx,
        storeId,
        reservation.id,
        ReservationStatus.ACTIVE,
        ReservationStatus.CONSUMED,
      );
      if (count === 0) {
        continue; // concurrent consume/release won; idempotent skip
      }

      const inventoryResult = await this.inventory.guardedConsume(
        tx,
        storeId,
        reservation.variantId,
        reservation.quantity,
      );
      if (inventoryResult.count === 0) {
        throw new ConflictError('The inventory row for the reservation could not be found.');
      }

      const current = await this.inventory.findByVariantTx(tx, storeId, reservation.variantId);
      if (!current) {
        throw new NotFoundError('The inventory row could not be found.');
      }

      await this.movements.create(tx, {
        storeId,
        variantId: reservation.variantId,
        movementType: MovementType.CONSUMPTION,
        quantity: -reservation.quantity,
        referenceType: 'reservation',
        referenceId: reservation.id,
        reason: null,
        onHandAfter: current.onHandQuantity,
        reservedAfter: current.reservedQuantity,
      });

      consumed += 1;
    }

    return { consumed };
  }

  /**
   * Reservation expiration sweep (docs/DATABASE.md §14.2/§28.6).
   *
   * Expiration is NOT a state: expired ACTIVE reservations are transitioned
   * ACTIVE -> RELEASED (guarded), releasing their reserved quantity and
   * writing a RELEASE movement. Each reservation is processed independently in
   * its own tenant-bound transaction, so the sweep is idempotent and each
   * reservation is independently retryable. A reservation already consumed or
   * released by a concurrent operation is skipped (guarded UPDATE count 0).
   *
   * `storeId` comes from the trusted tenant context.
   */
  async expireDueReservations(batchSize = 100): Promise<{ scanned: number; released: number }> {
    return this.expireDueReservationsForStore(requireStoreId(this.requestContext), batchSize);
  }

  /**
   * Store-driven reservation expiration sweep — the callable unit used by the
   * Phase 21 periodic maintenance job (no request context required). Each
   * reservation is released in its own tenant-bound transaction with the
   * guarded ACTIVE -> RELEASED transition first, so repeated execution is an
   * idempotent no-op and paid (CONSUMED) reservations are never released.
   */
  async expireDueReservationsForStore(
    storeId: string,
    batchSize = 100,
  ): Promise<{ scanned: number; released: number }> {
    if (!Number.isInteger(batchSize) || batchSize <= 0) {
      throw new ValidationError('Batch size must be a positive integer.');
    }

    const due = await this.reservations.findDueForExpiration(storeId, new Date(), batchSize);

    let released = 0;
    for (const reservation of due) {
      const applied = await this.transaction.runWithTenant(storeId, async (tx) => {
        const { count } = await this.reservations.transitionStatus(
          tx,
          storeId,
          reservation.id,
          ReservationStatus.ACTIVE,
          ReservationStatus.RELEASED,
        );
        if (count === 0) {
          return false; // concurrent op (consume/release) won; skip idempotently
        }

        const inventoryResult = await this.inventory.guardedRelease(
          tx,
          storeId,
          reservation.variantId,
          reservation.quantity,
        );
        if (inventoryResult.count === 0) {
          throw new ConflictError('The inventory row for the reservation could not be found.');
        }

        const current = await this.inventory.findByVariantTx(tx, storeId, reservation.variantId);
        if (!current) {
          throw new NotFoundError('The inventory row could not be found.');
        }

        await this.movements.create(tx, {
          storeId,
          variantId: reservation.variantId,
          movementType: MovementType.RELEASE,
          quantity: -reservation.quantity,
          referenceType: 'reservation',
          referenceId: reservation.id,
          reason: null,
          onHandAfter: current.onHandQuantity,
          reservedAfter: current.reservedQuantity,
        });

        return true;
      });

      if (applied) {
        released += 1;
      }
    }

    return { scanned: due.length, released };
  }
}
