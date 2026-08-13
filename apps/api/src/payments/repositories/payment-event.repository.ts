import { Injectable } from '@nestjs/common';
import { EventProcessingStatus, PaymentEvent, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Minimal write input for claiming a PaymentEvent (docs/DATABASE.md §7.20). */
export interface CreatePaymentEventInput {
  provider: string;
  providerEventId: string;
  eventType: string;
  payload: Prisma.InputJsonValue;
  signatureVerified: boolean;
  storeId?: string | null;
  paymentId?: string | null;
}

/**
 * Persistence access for the `payment_events` table (docs/DATABASE.md §7.20
 * /§16.5) — the raw provider webhook/event log. A verified provider event is
 * the authority for payment confirmation; a browser redirect is never.
 *
 * Deduplication is the UNIQUE (provider, provider_event_id) constraint
 * (partial unique — §7.20/§27.1); duplicate deliveries are re-claimed and
 * processed with guarded transitions (idempotent).
 *
 * store_id is NULL until the payment is resolved; the row becomes
 * tenant-visible only when store_id is set (DATABASE §7.20 RLS note). The
 * claim therefore runs on the service-role capable connection (DATABASE §29.2
 * — webhook processing is never tenant-scoped user context).
 */
@Injectable()
export class PaymentEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Claims the event row (plain client — webhook has no tenant context yet). */
  async create(data: CreatePaymentEventInput): Promise<PaymentEvent> {
    return this.prisma.paymentEvent.create({
      data: {
        storeId: data.storeId ?? null,
        paymentId: data.paymentId ?? null,
        provider: data.provider,
        providerEventId: data.providerEventId,
        eventType: data.eventType,
        payload: data.payload,
        signatureVerified: data.signatureVerified,
      },
    });
  }

  /** Reads an already-claimed event by its provider identity (dedup lookup). */
  async findByProviderEventId(
    provider: string,
    providerEventId: string,
  ): Promise<PaymentEvent | null> {
    return this.prisma.paymentEvent.findUnique({
      where: { provider_providerEventId: { provider, providerEventId } },
    });
  }

  /**
   * Marks the event PROCESSED and resolves it to its store + payment inside
   * the caller's tenant-bound transaction (DATABASE §16.5 step 3/5). Setting
   * store_id makes the row tenant-visible and matches the documented
   * "set payment_events.store_id" step.
   */
  async markProcessedTx(
    tx: Prisma.TransactionClient,
    eventId: string,
    storeId: string,
    paymentId: string,
  ): Promise<{ count: number }> {
    return tx.paymentEvent.updateMany({
      where: { id: eventId },
      data: {
        storeId,
        paymentId,
        processingStatus: EventProcessingStatus.PROCESSED,
        processedAt: new Date(),
        errorMessage: null,
      },
    });
  }

  /**
   * Marks the event ERROR with a safe error message so it remains visible to
   * the retry/reprocessing scan (partial index on RECEIVED/ERROR — §11). No
   * provider secrets or stack traces are ever stored.
   */
  async markError(eventId: string, message: string): Promise<{ count: number }> {
    return this.prisma.paymentEvent.updateMany({
      where: { id: eventId },
      data: { processingStatus: EventProcessingStatus.ERROR, errorMessage: message },
    });
  }

  /** Store-scoped read of a single event (merchant visibility, shared client). */
  async findById(storeId: string, eventId: string): Promise<PaymentEvent | null> {
    return this.prisma.paymentEvent.findFirst({ where: { id: eventId, storeId } });
  }
}
