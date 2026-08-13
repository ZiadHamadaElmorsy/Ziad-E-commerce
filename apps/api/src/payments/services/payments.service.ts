import { Injectable, Logger } from '@nestjs/common';
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { requireStoreId } from '../../catalog/domain/catalog-tenant';
import { RequestContextService } from '../../common/context/request-context.service';
import {
  ConflictError,
  IdempotencyConflictError,
  NotFoundError,
  StateTransitionError,
  ValidationError,
} from '../../common/errors/domain-exceptions';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { OrderRepository } from '../../orders/repositories/order.repository';
import { assertPaymentTransition, attemptTimestamps } from '../domain/payment-lifecycle';
import { mapPaymentWriteError } from '../domain/payment-error.mapper';
import { PaymentAttemptRepository } from '../repositories/payment-attempt.repository';
import { PaymentRepository } from '../repositories/payment.repository';
import { PaymentView, PaymentWithAttempts, toPaymentView } from '../payments.types';
import { PaymentProvider } from '../providers/payment-provider';

/** Provider name persisted on payment records (docs/DATABASE.md §16.2). */
export const PAYMOB_PROVIDER = 'paymob';

/** failure_code written when provider initiation itself fails. */
const FAILURE_CODE_INITIATION = 'INITIATION_FAILED';

/**
 * Payment application service (docs/API-SPEC.md §24 "Create Payment Attempt",
 * docs/DOMAIN-MODEL.md §13, docs/DATABASE.md §16/§27/§28.7).
 *
 * POST /orders/:orderId/payments — the merchant/customer payment initiation:
 *
 * - Tenant: storeId ALWAYS comes from the trusted tenant context (membership
 *   -> store); order ownership is store-scoped; client-supplied ids are never
 *   an authorization source. Missing/foreign orders fail closed with
 *   NOT_FOUND.
 * - Only a PENDING order is payable. An existing NON-FAILED payment blocks
 *   new initiation (DATABASE §16.4: a new Payment may only be created after a
 *   FAILED one). Idempotency-Key replays return the original payment.
 * - Amount/currency are derived from the order's authoritative totals
 *   (grand_total, currency) — never from the client.
 * - Payment + PaymentAttempt are created PENDING inside one tenant-bound
 *   transaction; the provider session (auth -> order -> payment key) is then
 *   initiated OUTSIDE the transaction (DATABASE §28.7). Success marks
 *   PENDING -> PROCESSING with the provider reference; failure marks
 *   PENDING -> PROCESSING -> FAILED (the documented failure flow) with safe
 *   failure information.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly requestContext: RequestContextService,
    private readonly orders: OrderRepository,
    private readonly payments: PaymentRepository,
    private readonly attempts: PaymentAttemptRepository,
    private readonly provider: PaymentProvider,
    private readonly transaction: TransactionService,
  ) {}

  /** POST /orders/:orderId/payments — create + initiate a payment attempt. */
  async createPayment(orderId: string, idempotencyKey: string | undefined): Promise<PaymentView> {
    const storeId = requireStoreId(this.requestContext);

    if (!idempotencyKey) {
      throw new ValidationError('The Idempotency-Key header is required for payment initiation.');
    }

    // Load the order (store-scoped). Missing/foreign -> NOT_FOUND (no leak).
    const order = await this.orders.findWithDetails(storeId, orderId);
    if (!order) {
      throw new NotFoundError('The order was not found.');
    }

    // Only PENDING orders can be paid (order lifecycle, DATABASE §15.2/§16.4).
    if (order.status !== OrderStatus.PENDING) {
      throw new StateTransitionError(
        `The order cannot be paid in its current state (${order.status}).`,
      );
    }

    // Idempotent replay: the same key returns the original payment result.
    const existing = await this.payments.findByIdempotencyKey(storeId, idempotencyKey);
    if (existing) {
      if (existing.orderId !== orderId) {
        throw new IdempotencyConflictError(
          'This idempotency key was already used for a different order.',
        );
      }
      return this.toViewWithAttempts(storeId, existing.id);
    }

    // After a FAILED payment a new Payment may be created; while any
    // PENDING/PROCESSING/SUCCEEDED payment exists, initiation is blocked.
    const active = await this.payments.findNonFailedForOrder(storeId, orderId);
    if (active) {
      throw new ConflictError(
        'An active payment already exists for this order. Retry only after it fails.',
      );
    }

    // Create Payment + PaymentAttempt (both PENDING) in ONE tenant-bound
    // transaction. Any failure rolls back — no orphan payment rows.
    let created: { paymentId: string; attemptId: string };
    try {
      created = await this.transaction.runWithTenant(storeId, async (tx) => {
        const payment = await this.payments.create(tx, {
          storeId,
          orderId,
          provider: PAYMOB_PROVIDER,
          amount: order.grandTotal,
          currency: order.currency,
          idempotencyKey,
        });
        const attempt = await this.attempts.create(tx, {
          paymentId: payment.id,
          amount: order.grandTotal,
          currency: order.currency,
          idempotencyKey,
        });
        return { paymentId: payment.id, attemptId: attempt.id };
      });
    } catch (error) {
      throw mapPaymentWriteError(error);
    }

    // Provider initiation AFTER the DB commit (DATABASE §28.7). Never inside
    // the transaction above.
    try {
      const initiated = await this.provider.initiatePayment({
        paymentId: created.paymentId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount: order.grandTotal,
        currency: order.currency,
        billingData: {
          email: order.customerEmail ?? undefined,
          phone: order.customerPhone ?? undefined,
          ...this.billingFromShippingSnapshot(order),
        },
      });

      await this.transaction.runWithTenant(storeId, async (tx) => {
        await this.markInitiated(
          tx,
          storeId,
          created.paymentId,
          created.attemptId,
          initiated.providerReference,
        );
      });

      return this.toViewWithAttempts(storeId, created.paymentId, initiated.providerCheckoutUrl);
    } catch (error) {
      await this.markInitiationFailed(storeId, created.paymentId, created.attemptId, error);
      throw mapInitiationError(error);
    }
  }

  /** GET /orders/:orderId/payment — the active (most recent) payment. */
  async getPayment(orderId: string): Promise<PaymentView> {
    const storeId = requireStoreId(this.requestContext);

    const order = await this.orders.findWithDetails(storeId, orderId);
    if (!order) {
      throw new NotFoundError('The order was not found.');
    }

    const payment = await this.payments.findLatestForOrder(storeId, orderId);
    if (!payment) {
      throw new NotFoundError('No payment exists for this order.');
    }

    return this.toViewWithAttempts(storeId, payment.id);
  }

  /** Marks payment + attempt PENDING -> PROCESSING with the provider reference. */
  private async markInitiated(
    tx: Prisma.TransactionClient,
    storeId: string,
    paymentId: string,
    attemptId: string,
    providerReference: string,
  ): Promise<void> {
    assertPaymentTransition(PaymentStatus.PENDING, PaymentStatus.PROCESSING);
    await this.payments.transitionStatus(
      tx,
      storeId,
      paymentId,
      PaymentStatus.PENDING,
      PaymentStatus.PROCESSING,
      { providerReference },
    );
    assertPaymentTransition(PaymentStatus.PENDING, PaymentStatus.PROCESSING);
    await this.attempts.transitionStatus(
      tx,
      paymentId,
      attemptId,
      PaymentStatus.PENDING,
      PaymentStatus.PROCESSING,
      { providerReference, ...attemptTimestamps(PaymentStatus.PROCESSING) },
    );
  }

  /**
   * Marks payment + attempt FAILED after a provider-initiation error, using
   * the documented failure flow PENDING -> PROCESSING -> FAILED in one
   * tenant-bound transaction. Failure information is safe text only.
   */
  private async markInitiationFailed(
    storeId: string,
    paymentId: string,
    attemptId: string,
    error: unknown,
  ): Promise<void> {
    const message = safeInitiationFailureMessage(error);
    try {
      await this.transaction.runWithTenant(storeId, async (tx) => {
        assertPaymentTransition(PaymentStatus.PENDING, PaymentStatus.PROCESSING);
        await this.payments.transitionStatus(
          tx,
          storeId,
          paymentId,
          PaymentStatus.PENDING,
          PaymentStatus.PROCESSING,
        );
        assertPaymentTransition(PaymentStatus.PROCESSING, PaymentStatus.FAILED);
        await this.payments.transitionStatus(
          tx,
          storeId,
          paymentId,
          PaymentStatus.PROCESSING,
          PaymentStatus.FAILED,
          { failureCode: FAILURE_CODE_INITIATION, failureMessage: message },
        );

        assertPaymentTransition(PaymentStatus.PENDING, PaymentStatus.PROCESSING);
        await this.attempts.transitionStatus(
          tx,
          paymentId,
          attemptId,
          PaymentStatus.PENDING,
          PaymentStatus.PROCESSING,
          { ...attemptTimestamps(PaymentStatus.PROCESSING) },
        );
        assertPaymentTransition(PaymentStatus.PROCESSING, PaymentStatus.FAILED);
        await this.attempts.transitionStatus(
          tx,
          paymentId,
          attemptId,
          PaymentStatus.PROCESSING,
          PaymentStatus.FAILED,
          {
            failureCode: FAILURE_CODE_INITIATION,
            failureMessage: message,
            ...attemptTimestamps(PaymentStatus.FAILED),
          },
        );
      });
    } catch (recordingError) {
      // Never mask the original provider error with a persistence failure.
      this.logger.warn(`Failed to record payment initiation failure: ${String(recordingError)}`);
    }
  }

  private async toViewWithAttempts(
    storeId: string,
    paymentId: string,
    providerCheckoutUrl?: string,
  ): Promise<PaymentView> {
    const payment = await this.payments.findById(storeId, paymentId);
    if (!payment) {
      throw new NotFoundError('The payment was not found.');
    }
    const attempt = await this.attempts.findLatestForPayment(payment.id);
    const withAttempts: PaymentWithAttempts = { ...payment, attempts: attempt ? [attempt] : [] };
    return toPaymentView(withAttempts, providerCheckoutUrl);
  }

  /** Maps the purchase-time shipping snapshot into provider billing data. */
  private billingFromShippingSnapshot(order: {
    shippingAddressSnapshot: unknown;
  }): Record<string, string | undefined> {
    const snapshot =
      order.shippingAddressSnapshot !== null && typeof order.shippingAddressSnapshot === 'object'
        ? (order.shippingAddressSnapshot as Record<string, unknown>)
        : {};
    return {
      governorate: asString(snapshot.governorate),
      city: asString(snapshot.city),
      addressLine: asString(snapshot.addressLine),
      building: asString(snapshot.building),
      apartment: asString(snapshot.apartment),
    };
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

/** Safe, client-safe failure message — never provider secrets or internals. */
function safeInitiationFailureMessage(error: unknown): string {
  if (error instanceof ConflictError) {
    return error.message;
  }
  return 'Payment initiation failed.';
}

/**
 * Maps a provider-initiation failure to a clean domain error: the payment was
 * already marked FAILED, so the client receives a stable 409 CONFLICT (and may
 * retry with a new idempotency key — DATABASE §16.4) instead of a generic 500.
 */
function mapInitiationError(error: unknown): unknown {
  if (error instanceof ConflictError) {
    return error;
  }
  return new ConflictError('Payment initiation failed.');
}
