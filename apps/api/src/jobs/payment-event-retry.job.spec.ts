import { ConfigService } from '@nestjs/config';
import { EventProcessingStatus } from '@prisma/client';
import { PaymentEventRepository } from '../payments/repositories/payment-event.repository';
import { PaymentProvider } from '../payments/providers/payment-provider';
import { PaymobWebhookService } from '../payments/services/paymob-webhook.service';
import { PaymentEventRetryJob, PAYMENT_RETRY_LEASE_JOB } from './payment-event-retry.job';
import { SweepLeaseService } from './sweep-lease.service';

describe('PaymentEventRetryJob (Phase 28 — F-3)', () => {
  let provider: { parseWebhookEvent: jest.Mock };
  let events: { findUnprocessed: jest.Mock; markError: jest.Mock };
  let webhook: { processVerifiedEvent: jest.Mock };
  let configService: { get: jest.Mock };
  let leases: { tryAcquire: jest.Mock; release: jest.Mock };
  let job: PaymentEventRetryJob;

  const unprocessedEvent = {
    id: 'event-1',
    storeId: null,
    paymentId: null,
    provider: 'paymob',
    providerEventId: 'txn-1',
    eventType: 'transaction',
    payload: { type: 'transaction', obj: { id: 'txn-1', success: true } },
    signatureVerified: true,
    processingStatus: EventProcessingStatus.RECEIVED,
    errorMessage: null,
    processedAt: null,
    createdAt: new Date('2026-08-17T00:00:00Z'),
  };

  beforeEach(() => {
    provider = { parseWebhookEvent: jest.fn() };
    events = { findUnprocessed: jest.fn(), markError: jest.fn().mockResolvedValue({ count: 1 }) };
    webhook = {
      processVerifiedEvent: jest.fn().mockResolvedValue({ status: 'processed' }),
    };
    configService = { get: jest.fn().mockReturnValue(20) };
    leases = {
      tryAcquire: jest.fn().mockResolvedValue(true),
      release: jest.fn().mockResolvedValue(undefined),
    };
    job = new PaymentEventRetryJob(
      provider as unknown as PaymentProvider,
      events as unknown as PaymentEventRepository,
      webhook as unknown as PaymobWebhookService,
      configService as unknown as ConfigService,
      leases as unknown as SweepLeaseService,
    );
  });

  afterEach(() => {
    job.onModuleDestroy();
  });

  it('acquires the lease, reprocesses every unprocessed event and releases it', async () => {
    provider.parseWebhookEvent.mockReturnValue({
      providerEventId: 'txn-1',
      eventType: 'transaction',
      paymentReference: 'payment-1',
      success: true,
      pending: false,
      failureCode: null,
      failureMessage: null,
    });
    events.findUnprocessed.mockResolvedValue([unprocessedEvent]);

    const result = await job.runRetry();

    expect(leases.tryAcquire).toHaveBeenCalledWith(
      PAYMENT_RETRY_LEASE_JOB,
      20,
      expect.any(String),
    );
    expect(events.findUnprocessed).toHaveBeenCalledWith(20);
    expect(webhook.processVerifiedEvent).toHaveBeenCalledWith(
      expect.objectContaining({ providerEventId: 'txn-1' }),
      unprocessedEvent.payload,
    );
    expect(leases.release).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ scanned: 1, processed: 1, failed: 0 });
  });

  it('skips the whole pass when another instance holds the retry lease', async () => {
    leases.tryAcquire.mockResolvedValue(false);

    const result = await job.runRetry();

    expect(events.findUnprocessed).not.toHaveBeenCalled();
    expect(result).toEqual({ scanned: 0, processed: 0, failed: 0 });
  });

  it('marks an unparseable stored payload ERROR and counts it failed (no crash)', async () => {
    provider.parseWebhookEvent.mockReturnValue(null);
    events.findUnprocessed.mockResolvedValue([unprocessedEvent]);

    const result = await job.runRetry();

    expect(events.markError).toHaveBeenCalledWith('event-1', 'Unrecognized stored webhook payload.');
    expect(webhook.processVerifiedEvent).not.toHaveBeenCalled();
    expect(result).toEqual({ scanned: 1, processed: 0, failed: 1 });
  });

  it('counts an unresolved payment as failed (event stays in the scan) and continues', async () => {
    provider.parseWebhookEvent.mockReturnValue({
      providerEventId: 'txn-1',
      eventType: 'transaction',
      paymentReference: null,
      success: true,
      pending: false,
      failureCode: null,
      failureMessage: null,
    });
    webhook.processVerifiedEvent.mockResolvedValue({ status: 'payment_unresolved' });
    events.findUnprocessed.mockResolvedValue([unprocessedEvent]);

    const result = await job.runRetry();

    expect(result).toEqual({ scanned: 1, processed: 0, failed: 1 });
  });

  it('does not abort the batch when a single event throws', async () => {
    provider.parseWebhookEvent.mockReturnValue({
      providerEventId: 'txn-1',
      eventType: 'transaction',
      paymentReference: 'payment-1',
      success: true,
      pending: false,
      failureCode: null,
      failureMessage: null,
    });
    webhook.processVerifiedEvent
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ status: 'processed' });
    events.findUnprocessed.mockResolvedValue([unprocessedEvent, unprocessedEvent]);

    const result = await job.runRetry();

    expect(result).toEqual({ scanned: 2, processed: 1, failed: 1 });
  });
});
