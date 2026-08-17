import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PaymentsModule } from '../payments/payments.module';
import { PaymentEventRetryJob } from './payment-event-retry.job';
import { ReservationExpiryJob } from './reservation-expiry.job';
import { SweepLeaseService } from './sweep-lease.service';

/**
 * Background maintenance jobs module (Phase 21, lease Phase 23).
 *
 *   1. the cart/reservation expiry sweep ({@link ReservationExpiryJob}) and
 *   2. the payment-event retry sweep ({@link PaymentEventRetryJob}, Phase 28 —
 *      F-3).
 * The jobs are env-gated
 * (RESERVATION_EXPIRY_ENABLED / PAYMENT_RETRY_ENABLED) and disabled under
 * NODE_ENV=test by default so suites stay deterministic; their logic is
 * unit-tested directly. Phase 23 adds {@link SweepLeaseService} — a distributed
 * lease on `job_leases` so a multi-instance deployment never sweeps
 * concurrently on every node.
 */
@Module({
  imports: [CartModule, InventoryModule, PaymentsModule],
  providers: [ReservationExpiryJob, SweepLeaseService, PaymentEventRetryJob],
  exports: [ReservationExpiryJob, PaymentEventRetryJob],
})
export class JobsModule {}
