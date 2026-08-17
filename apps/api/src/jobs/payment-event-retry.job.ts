import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { PaymentEventRepository } from '../payments/repositories/payment-event.repository';
import { PaymobWebhookService } from '../payments/services/paymob-webhook.service';
import { PaymentProvider } from '../payments/providers/payment-provider';
import { SweepLeaseService } from './sweep-lease.service';

/** Lease job name for the payment-event retry/reprocessing sweep (job_leases). */
export const PAYMENT_RETRY_LEASE_JOB = 'payment-event-retry';

/**
 * Payment-event retry / reprocessing sweep (Phase 28 — F-3).
 *
 * The payment webhook path is synchronous and idempotent, but a transient
 * failure (provider unreachable, DB contention, crash) can leave a
 * `payment_events` row in RECEIVED/ERROR — and the corresponding `payments`
 * row in PROCESSING — with no automated recovery. This job:
 *
 *   1. Runs every `PAYMENT_RETRY_INTERVAL_MS` (default 5 min) when
 *      `PAYMENT_RETRY_ENABLED` is truthy (disabled under NODE_ENV=test so
 *      suites stay deterministic).
 *   2. Scans RECEIVED/ERROR events (bounded batch, oldest first — served by
 *      the `idx_payment_events_processing_status` partial index) and re-applies
 *      the SAME guarded, idempotent webhook processing through
 *      `PaymobWebhookService.processVerifiedEvent`. Signatures were verified
 *      when the event was first received; re-verification is neither possible
 *      nor needed on the stored payload.
 *   3. Is safe by construction: every transition inside
 *      `processVerifiedEvent` is guarded (WHERE status = from) and the event
 *      claim is deduplicated by `UNIQUE (provider, provider_event_id)`, so a
 *      concurrent live webhook and this job can never double-consume
 *      inventory, double-confirm an order or apply a conflicting terminal
 *      state.
 *   4. Acquires a distributed lease (`SweepLeaseService` on `job_leases`)
 *      before running, so at most ONE API instance retries at a time in a
 *      scale-out deployment. A crashed instance's lease expires after
 *      `PAYMENT_RETRY_LEASE_TTL_MS` (default 10 min).
 *
 * A payment whose event keeps failing stays RECEIVED/ERROR for the next pass;
 * a manual/ops rerun can be triggered via the exported `runRetry()` (used by
 * tests). Provider reconciliation of PROCESSING payments past a threshold is a
 * documented follow-up (requires a provider status-query method).
 */
@Injectable()
export class PaymentEventRetryJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentEventRetryJob.name);
  private timer: NodeJS.Timeout | undefined;
  /** Stable per-instance lease owner id (released on a clean sweep end). */
  private readonly instanceId = randomUUID();

  constructor(
    private readonly provider: PaymentProvider,
    private readonly events: PaymentEventRepository,
    private readonly webhook: PaymobWebhookService,
    private readonly config: ConfigService,
    private readonly leases: SweepLeaseService,
  ) {}

  onModuleInit(): void {
    const enabled = this.config.get<boolean>('paymentRetry.enabled') ?? false;
    if (!enabled) {
      this.logger.log(
        'Payment-event retry sweep is disabled (PAYMENT_RETRY_ENABLED is not truthy).',
      );
      return;
    }
    const intervalMs = this.config.get<number>('paymentRetry.intervalMs') ?? 5 * 60 * 1000;
    this.timer = setInterval(() => {
      void this.runRetry().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Payment-event retry run failed: ${message}`);
      });
    }, intervalMs);
    this.timer.unref?.();
    this.logger.log(`Payment-event retry sweep scheduled every ${intervalMs}ms.`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** Runs one full retry pass. Returns aggregate counts. */
  async runRetry(): Promise<{ scanned: number; processed: number; failed: number }> {
    const leaseTtlMs = this.config.get<number>('paymentRetry.leaseTtlMs') ?? 10 * 60 * 1000;
    const acquired = await this.leases.tryAcquire(
      PAYMENT_RETRY_LEASE_JOB,
      leaseTtlMs,
      this.instanceId,
    );
    if (!acquired) {
      this.logger.log('Payment-event retry skipped: another instance holds the retry lease.');
      return { scanned: 0, processed: 0, failed: 0 };
    }

    try {
      return await this.runRetryUnlocked();
    } finally {
      await this.leases.release(PAYMENT_RETRY_LEASE_JOB, this.instanceId);
    }
  }

  /** The lease-free retry body (bounded batch, per-event guard). */
  private async runRetryUnlocked(): Promise<{
    scanned: number;
    processed: number;
    failed: number;
  }> {
    const batchSize = this.config.get<number>('paymentRetry.batchSize') ?? 20;
    const events = await this.events.findUnprocessed(batchSize);

    let processed = 0;
    let failed = 0;

    for (const event of events) {
      try {
        const parsed = this.provider.parseWebhookEvent(event.payload);
        if (!parsed || !parsed.providerEventId) {
          // The stored payload is unparseable — keep it ERROR and move on.
          await this.events.markError(event.id, 'Unrecognized stored webhook payload.');
          failed += 1;
          continue;
        }

        const result = await this.webhook.processVerifiedEvent(parsed, event.payload);
        // 'processed' and 'already_processed' are both terminal successes for
        // the retry pass; 'payment_unresolved' keeps the event in the scan.
        if (result.status === 'payment_unresolved') {
          failed += 1;
        } else {
          processed += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`payment event retry failed: eventId=${event.id} error=${message}`);
        failed += 1;
      }
    }

    if (events.length > 0) {
      this.logger.log(
        `Payment-event retry pass complete: scanned=${events.length} processed=${processed} failed=${failed}.`,
      );
    }

    return { scanned: events.length, processed, failed };
  }
}

