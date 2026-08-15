import { Injectable, Logger } from '@nestjs/common';
import {
  EventProcessingStatus,
  OrderStatus,
  PaymentEvent,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import {
  BadRequestError,
  NotFoundError,
  StateTransitionError,
} from '../../common/errors/domain-exceptions';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { InventoryReservationService } from '../../inventory/services/inventory-reservation.service';
import { AuditLogRepository } from '../../orders/repositories/audit-log.repository';
import { OrderRepository } from '../../orders/repositories/order.repository';
import { transitionTimestamps } from '../../orders/domain/order-lifecycle';
import { assertPaymentTransition, attemptTimestamps } from '../domain/payment-lifecycle';
import { isWebhookDuplicate, mapWebhookClaimError } from '../domain/payment-error.mapper';
import { PaymentAttemptRepository } from '../repositories/payment-attempt.repository';
import { PaymentEventRepository } from '../repositories/payment-event.repository';
import { PaymentRepository } from '../repositories/payment.repository';
import { PaymentProvider, ProviderWebhookEvent } from '../providers/payment-provider';

/** Audit action strings for webhook-driven payment events (DATABASE §7.18). */
const AUDIT_PAYMENT_SUCCEEDED = 'payment.succeeded';
const AUDIT_PAYMENT_FAILED = 'payment.failed';
const AUDIT_ORDER_STATUS_CHANGED = 'order.status_changed';

export interface WebhookProcessingResult {
  status: 'processed' | 'already_processed' | 'payment_unresolved';
}

/**
 * Paymob webhook processor (docs/API-SPEC.md §24 "Payment Webhook",
 * docs/DATABASE.md §16.5/§28.2/§28.3).
 *
 * The webhook has NO merchant authentication context: authenticity comes from
 * the provider signature (HMAC), the tenant is derived server-side from the
 * resolved payment (never from client input), and processing is idempotent.
 *
 * Documented sequence (§16.5):
 *   1. Verify authenticity/signature — fail closed.
 *   2. Claim the payment_events row (UNIQUE provider+provider_event_id) —
 *      duplicate deliveries of a PROCESSED event are a safe no-op.
 *   3. Resolve the payment from the provider's merchant reference and set the
 *      tenant from the payment's own store_id.
 *   4. Apply guarded transitions in ONE tenant-bound transaction (§28.2/§28.3):
 *      SUCCEEDED -> payment SUCCEEDED, reservations ACTIVE->CONSUMED, order
 *      PENDING->CONFIRMED; FAILED -> payment FAILED, reservations
 *      ACTIVE->RELEASED. Every transition is guarded (idempotent), so retries
 *      and duplicate deliveries NEVER double-consume inventory or re-confirm.
 *   5. Mark the event PROCESSED.
 *
 * A browser redirect is NEVER authoritative — only a verified provider event
 * is (DATABASE §16.5/§16.6).
 */
@Injectable()
export class PaymobWebhookService {
  private readonly logger = new Logger(PaymobWebhookService.name);

  constructor(
    private readonly provider: PaymentProvider,
    private readonly events: PaymentEventRepository,
    private readonly payments: PaymentRepository,
    private readonly attempts: PaymentAttemptRepository,
    private readonly orders: OrderRepository,
    private readonly audit: AuditLogRepository,
    private readonly reservations: InventoryReservationService,
    private readonly transaction: TransactionService,
  ) {}

  /** POST /webhooks/paymob — verify, dedupe, resolve, process, mark PROCESSED. */
  async processWebhook(body: unknown, hmacFromQuery?: string): Promise<WebhookProcessingResult> {
    // 1. Verify authenticity. NEVER trust a webhook that merely says success.
    if (!this.provider.verifyWebhookSignature(body, hmacFromQuery)) {
      throw new BadRequestError('Invalid payment webhook signature.');
    }

    // 2. Map to the provider-agnostic event view.
    const event = this.provider.parseWebhookEvent(body);
    if (!event || !event.providerEventId) {
      throw new BadRequestError('Unrecognized payment webhook payload.');
    }

    // 3. Claim/dedupe the event row (UNIQUE provider + provider_event_id).
    const claimed = await this.claimEvent(event, body);
    if (claimed.alreadyProcessed) {
      // Phase 23 — safe structured log for duplicate deliveries (ids only).
      this.logger.log(
        `paymob webhook duplicate: eventId=${claimed.event.id} providerEventId=${event.providerEventId} status=already_processed`,
      );
      return { status: 'already_processed' };
    }

    // 4. Resolve the payment (tenant derived server-side from the payment row).
    const payment = event.paymentReference
      ? await this.payments.findByGlobalId(event.paymentReference)
      : null;
    if (!payment) {
      // Keep the event in the retry scan (RECEIVED/ERROR partial index) and
      // return a safe response — the provider must not receive secrets.
      await this.events.markError(claimed.event.id, 'Payment could not be resolved.');
      this.logger.warn(
        `paymob webhook unresolved: eventId=${claimed.event.id} providerEventId=${event.providerEventId} status=payment_unresolved`,
      );
      return { status: 'payment_unresolved' };
    }

    // 5. Apply guarded transitions + mark the event PROCESSED in ONE
    //    tenant-bound transaction (DATABASE §28.2/§28.3/§16.5).
    try {
      await this.transaction.runWithTenant(payment.storeId, async (tx) => {
        const order = await this.orders.findWithDetailsTx(tx, payment.storeId, payment.orderId);
        if (!order) {
          throw new NotFoundError('The order was not found.');
        }

        if (event.pending) {
          // Provider reports the transaction as still pending — no terminal
          // transition yet. Mark the event PROCESSED (idempotent).
          await this.events.markProcessedTx(tx, claimed.event.id, payment.storeId, payment.id);
          return;
        }

        if (event.success) {
          await this.applySuccess(tx, payment, order, event, claimed.event.id);
        } else {
          await this.applyFailure(tx, payment, order, event, claimed.event.id);
        }
      });
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof StateTransitionError) {
        throw error;
      }
      // Transaction failure: keep the event un-processed (RECEIVED) so the
      // retry/reprocessing scan can safely retry (guarded transitions).
      throw error;
    }
    // Phase 23 — safe structured log (ids only, never provider payload/secrets).
    this.logger.log(
      `paymob webhook processed: eventId=${claimed.event.id} providerEventId=${event.providerEventId} ` +
        `paymentId=${payment.id} storeId=${payment.storeId} status=processed`,
    );
    return { status: 'processed' };
  }

  /**
   * Claims (inserts) the provider event; on a duplicate delivery re-claims the
   * existing row. A duplicate of a PROCESSED event is a safe no-op; a
   * RECEIVED/ERROR event is re-processed (guarded transitions make this safe).
   */
  private async claimEvent(
    event: ProviderWebhookEvent,
    body: unknown,
  ): Promise<{ event: PaymentEvent; alreadyProcessed: boolean }> {
    try {
      const created = await this.events.create({
        provider: 'paymob',
        providerEventId: event.providerEventId,
        eventType: event.eventType,
        payload: this.safePayload(body),
        signatureVerified: true,
      });
      return { event: created, alreadyProcessed: false };
    } catch (error) {
      if (!isWebhookDuplicate(error)) {
        throw mapWebhookClaimError(error);
      }
      const existing = await this.events.findByProviderEventId('paymob', event.providerEventId);
      if (!existing) {
        throw mapWebhookClaimError(error);
      }
      if (existing.processingStatus === EventProcessingStatus.PROCESSED) {
        return { event: existing, alreadyProcessed: true };
      }
      return { event: existing, alreadyProcessed: false };
    }
  }

  /**
   * SUCCEEDED (§28.2): payment PROCESSING->SUCCEEDED + attempt
   * PROCESSING->SUCCEEDED + reservations ACTIVE->CONSUMED + order
   * PENDING->CONFIRMED + audit + event PROCESSED. All guarded/idempotent.
   */
  private async applySuccess(
    tx: Prisma.TransactionClient,
    payment: { id: string; storeId: string; orderId: string },
    order: { id: string; orderNumber: string; status: OrderStatus },
    event: ProviderWebhookEvent,
    eventId: string,
  ): Promise<void> {
    await this.resolvePaymentTerminal(tx, payment.storeId, payment.id, PaymentStatus.SUCCEEDED);
    const attempt = await this.attempts.findLatestForPayment(payment.id);
    if (attempt) {
      await this.resolveAttemptTerminal(tx, payment.id, attempt.id, PaymentStatus.SUCCEEDED);
    }

    // Inventory owns the reservation lifecycle — payment only calls the
    // consumption primitive. Idempotent: already-CONSUMED reservations skip.
    await this.reservations.consumeAllForOrderTx(tx, payment.storeId, order.id);

    // Order lifecycle stays with the Orders domain: guarded PENDING->CONFIRMED.
    if (order.status === OrderStatus.PENDING) {
      const { count } = await this.orders.transitionStatus(
        tx,
        payment.storeId,
        order.id,
        OrderStatus.PENDING,
        OrderStatus.CONFIRMED,
        transitionTimestamps(OrderStatus.CONFIRMED),
      );
      if (count === 1) {
        await this.audit.create(tx, {
          storeId: payment.storeId,
          userId: null,
          action: AUDIT_ORDER_STATUS_CHANGED,
          entityType: 'order',
          entityId: order.id,
          metadata: {
            orderNumber: order.orderNumber,
            from: OrderStatus.PENDING,
            to: OrderStatus.CONFIRMED,
            reason: AUDIT_PAYMENT_SUCCEEDED,
          },
        });
      }
    }

    await this.audit.create(tx, {
      storeId: payment.storeId,
      userId: null,
      action: AUDIT_PAYMENT_SUCCEEDED,
      entityType: 'payment',
      entityId: payment.id,
      metadata: {
        orderId: payment.orderId,
        orderNumber: order.orderNumber,
        provider: 'paymob',
        providerEventId: event.providerEventId,
      },
    });

    await this.events.markProcessedTx(tx, eventId, payment.storeId, payment.id);
  }

  /**
   * FAILED (§28.3): payment PROCESSING->FAILED + attempt PROCESSING->FAILED +
   * reservations ACTIVE->RELEASED + audit + event PROCESSED. The order stays
   * PENDING (a failed payment never confirms an order).
   */
  private async applyFailure(
    tx: Prisma.TransactionClient,
    payment: { id: string; storeId: string; orderId: string },
    order: { id: string; orderNumber: string },
    event: ProviderWebhookEvent,
    eventId: string,
  ): Promise<void> {
    await this.resolvePaymentTerminal(
      tx,
      payment.storeId,
      payment.id,
      PaymentStatus.FAILED,
      event.failureCode ?? null,
      event.failureMessage,
    );
    const attempt = await this.attempts.findLatestForPayment(payment.id);
    if (attempt) {
      await this.resolveAttemptTerminal(
        tx,
        payment.id,
        attempt.id,
        PaymentStatus.FAILED,
        event.failureCode ?? null,
        event.failureMessage,
      );
    }

    // Idempotent release (guarded ACTIVE->RELEASED); CONSUMED reservations skip.
    await this.reservations.releaseAllForOrderTx(tx, payment.storeId, order.id);

    await this.audit.create(tx, {
      storeId: payment.storeId,
      userId: null,
      action: AUDIT_PAYMENT_FAILED,
      entityType: 'payment',
      entityId: payment.id,
      metadata: {
        orderId: payment.orderId,
        orderNumber: order.orderNumber,
        provider: 'paymob',
        providerEventId: event.providerEventId,
        failureCode: event.failureCode,
        failureMessage: event.failureMessage,
      },
    });

    await this.events.markProcessedTx(tx, eventId, payment.storeId, payment.id);
  }

  /**
   * Guarded terminal payment transition. Handles the expected PROCESSING path
   * and the crash-window PENDING path (PENDING -> PROCESSING -> terminal) in
   * the same transaction. Already-terminal state is an idempotent no-op;
   * a conflicting terminal state fails closed.
   */
  private async resolvePaymentTerminal(
    tx: Prisma.TransactionClient,
    storeId: string,
    paymentId: string,
    to: PaymentStatus,
    failureCode?: string | null,
    failureMessage?: string | null,
  ): Promise<void> {
    const data = {
      ...(failureCode ? { failureCode } : {}),
      ...(failureMessage ? { failureMessage } : {}),
    };

    let { count } = await this.payments.transitionStatus(
      tx,
      storeId,
      paymentId,
      PaymentStatus.PROCESSING,
      to,
      data,
    );
    if (count === 1) {
      return;
    }

    const current = await this.payments.findByIdTx(tx, storeId, paymentId);
    if (!current) {
      throw new NotFoundError('The payment was not found.');
    }
    if (current.status === to) {
      return; // idempotent — a retried webhook re-applies no terminal transition
    }
    if (current.status === PaymentStatus.PENDING) {
      assertPaymentTransition(PaymentStatus.PENDING, PaymentStatus.PROCESSING);
      await this.payments.transitionStatus(
        tx,
        storeId,
        paymentId,
        PaymentStatus.PENDING,
        PaymentStatus.PROCESSING,
      );
      count = (
        await this.payments.transitionStatus(
          tx,
          storeId,
          paymentId,
          PaymentStatus.PROCESSING,
          to,
          data,
        )
      ).count;
      if (count !== 1) {
        throw new StateTransitionError('The payment state changed concurrently.');
      }
      return;
    }
    throw new StateTransitionError(`The payment is ${current.status} and cannot be marked ${to}.`);
  }

  /** Guarded terminal attempt transition (mirrors the payment resolution). */
  private async resolveAttemptTerminal(
    tx: Prisma.TransactionClient,
    paymentId: string,
    attemptId: string,
    to: PaymentStatus,
    failureCode?: string | null,
    failureMessage?: string | null,
  ): Promise<void> {
    const data = {
      ...(failureCode ? { failureCode } : {}),
      ...(failureMessage ? { failureMessage } : {}),
    };

    let { count } = await this.attempts.transitionStatus(
      tx,
      paymentId,
      attemptId,
      PaymentStatus.PROCESSING,
      to,
      { ...data, ...attemptTimestamps(to) },
    );
    if (count === 1) {
      return;
    }

    const current = await this.attempts.findLatestForPayment(paymentId);
    if (!current) {
      return; // attempt row gone (should not happen — attempts are retained)
    }
    if (current.id !== attemptId) {
      return; // a newer attempt exists; do not touch it
    }
    if (current.status === to) {
      return; // idempotent
    }
    if (current.status === PaymentStatus.PENDING) {
      assertPaymentTransition(PaymentStatus.PENDING, PaymentStatus.PROCESSING);
      await this.attempts.transitionStatus(
        tx,
        paymentId,
        attemptId,
        PaymentStatus.PENDING,
        PaymentStatus.PROCESSING,
        { ...attemptTimestamps(PaymentStatus.PROCESSING) },
      );
      count = (
        await this.attempts.transitionStatus(
          tx,
          paymentId,
          attemptId,
          PaymentStatus.PROCESSING,
          to,
          {
            ...data,
            ...attemptTimestamps(to),
          },
        )
      ).count;
      if (count !== 1) {
        throw new StateTransitionError('The payment attempt state changed concurrently.');
      }
    }
  }

  /** The raw provider payload stored on the event — never filtered or altered. */
  private safePayload(body: unknown): Prisma.InputJsonValue {
    return body as Prisma.InputJsonValue;
  }
}
