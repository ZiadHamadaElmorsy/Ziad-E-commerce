import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ReservationExpiryJob } from './reservation-expiry.job';
import { SweepLeaseService } from './sweep-lease.service';

/**
 * Background maintenance jobs module (Phase 21, lease Phase 23).
 *
 * Currently hosts the periodic cart/reservation expiry sweep
 * ({@link ReservationExpiryJob}). The job is env-gated
 * (RESERVATION_EXPIRY_ENABLED) and disabled under NODE_ENV=test by default so
 * suites stay deterministic; its logic is unit-tested directly. Phase 23 adds
 * {@link SweepLeaseService} — a distributed lease on `job_leases` so a
 * multi-instance deployment never sweeps concurrently on every node.
 */
@Module({
  imports: [CartModule, InventoryModule],
  providers: [ReservationExpiryJob, SweepLeaseService],
  exports: [ReservationExpiryJob],
})
export class JobsModule {}
