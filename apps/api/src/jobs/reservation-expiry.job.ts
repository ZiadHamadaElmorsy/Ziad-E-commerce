import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CartService } from '../cart/services/cart.service';
import { InventoryReservationService } from '../inventory/services/inventory-reservation.service';
import { SweepLeaseService } from './sweep-lease.service';

/** Lease job name for the cart/reservation expiry sweep (job_leases). */
export const SWEEP_LEASE_JOB = 'reservation-expiry-sweep';

/**
 * Periodic cart/reservation expiry sweep (Phase 21 — production hardening).
 *
 * The audit identified that abandoned checkouts could hold inventory forever:
 * reservations had no bound and no sweep existed. This job:
 *
 *   1. Runs every `RESERVATION_EXPIRY_INTERVAL_MS` (default 5 min) when
 *      `RESERVATION_EXPIRY_ENABLED` is true (production default; disabled in
 *      test).
 *   2. Iterates every Store and, per store, runs the callable sweep units:
 *        - `InventoryReservationService.expireDueReservationsForStore` —
 *          ACTIVE reservations with `expires_at <= now` are RELEASED and their
 *          reserved quantity restored (guarded, idempotent, per-reservation
 *          transaction).
 *        - `CartService.expireDueCartsForStore` — ACTIVE carts whose
 *          `expires_at` passed are transitioned ACTIVE -> EXPIRED.
 *   3. Never touches paid orders: a CONSUMED reservation is skipped by the
 *      guarded `WHERE status = 'ACTIVE'` transition, and the checkout->payment
 *      flow consumes reservations before the sweep could ever release them.
 *   4. Repeated executions are safe: expired reservations are already RELEASED
 *      (zero rows affected) and never double-release inventory.
 *
 * Implementation notes (Phase 23 multi-instance safety):
 *   - The sweep acquires a distributed lease (`SweepLeaseService` on the
 *     `job_leases` table) before running, so at most ONE API instance sweeps
 *     at a time in a scale-out deployment. A crashed instance's lease expires
 *     after `RESERVATION_EXPIRY_LEASE_TTL_MS` (default 10 min) — the sweep can
 *     never be blocked. `setInterval` (no new dependency) schedules the
 *     attempt on each node; the lease makes the nodes coordinate safely.
 *   - The sweep itself stays idempotent: guarded ACTIVE->RELEASED/EXPIRED
 *     transitions plus per-reservation transactions mean even an overlapping
 *     sweep never double-releases inventory or touches paid reservations.
 *   - Each store is processed independently with a bounded batch; a single
 *     store failure is logged and does not abort the sweep for other stores.
 *   - A manual run can be triggered via the exported `runSweep()` method (used
 *     by tests and operations).
 */
@Injectable()
export class ReservationExpiryJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReservationExpiryJob.name);
  private timer: NodeJS.Timeout | undefined;
  /** Stable per-instance lease owner id (released on a clean sweep end). */
  private readonly instanceId = randomUUID();

  constructor(
    private readonly prisma: PrismaService,
    private readonly carts: CartService,
    private readonly reservations: InventoryReservationService,
    private readonly config: ConfigService,
    private readonly leases: SweepLeaseService,
  ) {}

  onModuleInit(): void {
    const enabled = this.config.get<boolean>('expiry.sweepEnabled') ?? false;
    if (!enabled) {
      this.logger.log(
        'Cart/reservation expiry sweep is disabled (RESERVATION_EXPIRY_ENABLED is not truthy).',
      );
      return;
    }
    const intervalMs = this.config.get<number>('expiry.sweepIntervalMs') ?? 5 * 60 * 1000;
    // Run once shortly after boot, then on the configured interval. Phase 23:
    // a failed sweep (e.g. the job_leases migration not applied yet) is logged
    // and NEVER crashes the API process — the sweep is idempotent and retries
    // on the next interval.
    this.timer = setInterval(() => {
      void this.runSweep().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Expiry sweep run failed: ${message}`);
      });
    }, intervalMs);
    this.timer.unref?.();
    this.logger.log(`Cart/reservation expiry sweep scheduled every ${intervalMs}ms.`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** Runs one full sweep pass over every store. Returns aggregate counts. */
  async runSweep(): Promise<{ stores: number; cartsExpired: number; reservationsReleased: number }> {
    // Phase 23 — distributed lease: at most ONE instance sweeps at a time.
    // When another node holds the lease this pass is skipped (the other node
    // is already sweeping; the sweep is idempotent, so nothing is lost).
    const leaseTtlMs = this.config.get<number>('expiry.sweepLeaseTtlMs') ?? 10 * 60 * 1000;
    const acquired = await this.leases.tryAcquire(SWEEP_LEASE_JOB, leaseTtlMs, this.instanceId);
    if (!acquired) {
      this.logger.log('Expiry sweep skipped: another instance holds the sweep lease.');
      return { stores: 0, cartsExpired: 0, reservationsReleased: 0 };
    }

    try {
      return await this.runSweepUnlocked();
    } finally {
      await this.leases.release(SWEEP_LEASE_JOB, this.instanceId);
    }
  }

  /** The lease-free sweep body (all stores, bounded batches, per-store guard). */
  private async runSweepUnlocked(): Promise<{
    stores: number;
    cartsExpired: number;
    reservationsReleased: number;
  }> {
    const stores = await this.prisma.store.findMany({
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    const batchSize = this.config.get<number>('expiry.batchSize') ?? 100;

    let cartsExpired = 0;
    let reservationsReleased = 0;

    for (const store of stores) {
      try {
        const cartResult = await this.carts.expireDueCartsForStore(store.id, batchSize);
        const reservationResult = await this.reservations.expireDueReservationsForStore(
          store.id,
          batchSize,
        );
        cartsExpired += cartResult.expired;
        reservationsReleased += reservationResult.released;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Expiry sweep failed for store ${store.id}: ${message}`);
      }
    }

    if (stores.length > 0) {
      this.logger.log(
        `Expiry sweep complete: ${stores.length} stores, ${cartsExpired} carts expired, ` +
          `${reservationsReleased} reservations released.`,
      );
    }

    return { stores: stores.length, cartsExpired, reservationsReleased };
  }
}
