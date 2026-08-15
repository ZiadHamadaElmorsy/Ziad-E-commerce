import { EventProcessingStatus, OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { BadRequestError } from '../../common/errors/domain-exceptions';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { InventoryReservationService } from '../../inventory/services/inventory-reservation.service';
import { AuditLogRepository } from '../../orders/repositories/audit-log.repository';
import { OrderRepository } from '../../orders/repositories/order.repository';
import { PaymentAttemptRepository } from '../repositories/payment-attempt.repository';
import { PaymentEventRepository } from '../repositories/payment-event.repository';
import { PaymentRepository } from '../repositories/payment.repository';
import { PaymentProvider, ProviderWebhookEvent } from '../providers/payment-provider';
import { PaymobWebhookService } from './paymob-webhook.service';

describe('PaymobWebhookService', () => {
  let provider: {
    verifyWebhookSignature: jest.Mock;
    parseWebhookEvent: jest.Mock;
  };
  let events: {
    create: jest.Mock;
    findByProviderEventId: jest.Mock;
    markError: jest.Mock;
    markProcessedTx: jest.Mock;
  };
  let payments: {
    findByGlobalId: jest.Mock;
    findByIdTx: jest.Mock;
    transitionStatus: jest.Mock;
  };
  let attempts: { findLatestForPayment: jest.Mock; transitionStatus: jest.Mock };
  let orders: { findWithDetailsTx: jest.Mock; transitionStatus: jest.Mock };
  let audit: { create: jest.Mock };
  let reservations: { consumeAllForOrderTx: jest.Mock; releaseAllForOrderTx: jest.Mock };
  let transaction: { runWithTenant: jest.Mock };
  let service: PaymobWebhookService;

  const tx = {} as never;

  const paymentRow = {
    id: 'payment-1',
    storeId: 'store-1',
    orderId: 'order-1',
    status: PaymentStatus.PROCESSING,
    provider: 'paymob',
    providerReference: 'pm-order-1',
    amount: 1000n,
    currency: 'EGP',
    idempotencyKey: null,
    failureCode: null,
    failureMessage: null,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const attemptRow = {
    id: 'attempt-1',
    paymentId: 'payment-1',
    status: PaymentStatus.PROCESSING,
    providerReference: 'pm-order-1',
    idempotencyKey: null,
    amount: 1000n,
    currency: 'EGP',
    failureCode: null,
    failureMessage: null,
    initiatedAt: new Date('2026-08-12T00:00:00Z'),
    completedAt: null,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const orderRow = {
    id: 'order-1',
    storeId: 'store-1',
    orderNumber: 'ORD-2026-000001',
    status: OrderStatus.PENDING,
    items: [],
    reservations: [],
  };

  const eventRow = {
    id: 'event-1',
    storeId: null,
    paymentId: null,
    provider: 'paymob',
    providerEventId: 'txn-1',
    eventType: 'transaction',
    payload: {},
    signatureVerified: true,
    processingStatus: EventProcessingStatus.RECEIVED,
    errorMessage: null,
    processedAt: null,
    createdAt: new Date('2026-08-12T00:00:00Z'),
  };

  const successEvent: ProviderWebhookEvent = {
    providerEventId: 'txn-1',
    eventType: 'transaction',
    paymentReference: 'payment-1',
    success: true,
    pending: false,
    failureCode: null,
    failureMessage: null,
  };

  const failureEvent: ProviderWebhookEvent = {
    ...successEvent,
    success: false,
    failureMessage: 'Insufficient funds',
  };

  function withTx() {
    transaction.runWithTenant.mockImplementation(
      async (_storeId: string, work: (t: never) => Promise<unknown>) => work(tx),
    );
  }

  beforeEach(() => {
    provider = { verifyWebhookSignature: jest.fn(), parseWebhookEvent: jest.fn() };
    events = {
      create: jest.fn(),
      findByProviderEventId: jest.fn(),
      markError: jest.fn(),
      markProcessedTx: jest.fn(),
    };
    payments = { findByGlobalId: jest.fn(), findByIdTx: jest.fn(), transitionStatus: jest.fn() };
    attempts = { findLatestForPayment: jest.fn(), transitionStatus: jest.fn() };
    orders = { findWithDetailsTx: jest.fn(), transitionStatus: jest.fn() };
    audit = { create: jest.fn() };
    reservations = { consumeAllForOrderTx: jest.fn(), releaseAllForOrderTx: jest.fn() };
    transaction = { runWithTenant: jest.fn() };

    service = new PaymobWebhookService(
      provider as unknown as PaymentProvider,
      events as unknown as PaymentEventRepository,
      payments as unknown as PaymentRepository,
      attempts as unknown as PaymentAttemptRepository,
      orders as unknown as OrderRepository,
      audit as unknown as AuditLogRepository,
      reservations as unknown as InventoryReservationService,
      transaction as unknown as TransactionService,
    );
  });

  describe('verification', () => {
    it('rejects a webhook with an invalid signature (fail closed)', async () => {
      provider.verifyWebhookSignature.mockReturnValue(false);

      await expect(service.processWebhook({ type: 'transaction' })).rejects.toBeInstanceOf(
        BadRequestError,
      );
      expect(events.create).not.toHaveBeenCalled();
    });

    it('rejects a payload that cannot be parsed into an event', async () => {
      provider.verifyWebhookSignature.mockReturnValue(true);
      provider.parseWebhookEvent.mockReturnValue(null);

      await expect(service.processWebhook({ type: 'transaction', obj: {} })).rejects.toBeInstanceOf(
        BadRequestError,
      );
      expect(events.create).not.toHaveBeenCalled();
    });
  });

  describe('dedup', () => {
    it('returns already_processed for a duplicate of a PROCESSED event (no transitions)', async () => {
      provider.verifyWebhookSignature.mockReturnValue(true);
      provider.parseWebhookEvent.mockReturnValue(successEvent);
      events.create.mockRejectedValue(prismaUniqueError());
      events.findByProviderEventId.mockResolvedValue({
        ...eventRow,
        processingStatus: EventProcessingStatus.PROCESSED,
      });

      const result = await service.processWebhook({});

      expect(result).toEqual({ status: 'already_processed' });
      expect(payments.findByGlobalId).not.toHaveBeenCalled();
      expect(transaction.runWithTenant).not.toHaveBeenCalled();
    });

    it('re-claims a RECEIVED duplicate and processes it (guarded transitions are safe)', async () => {
      withTx();
      provider.verifyWebhookSignature.mockReturnValue(true);
      provider.parseWebhookEvent.mockReturnValue(successEvent);
      events.create.mockRejectedValue(prismaUniqueError());
      events.findByProviderEventId.mockResolvedValue(eventRow);
      payments.findByGlobalId.mockResolvedValue(paymentRow);
      payments.transitionStatus.mockResolvedValue({ count: 1 });
      attempts.findLatestForPayment.mockResolvedValue(attemptRow);
      attempts.transitionStatus.mockResolvedValue({ count: 1 });
      reservations.consumeAllForOrderTx.mockResolvedValue({ consumed: 1 });
      orders.findWithDetailsTx.mockResolvedValue(orderRow);
      orders.transitionStatus.mockResolvedValue({ count: 1 });
      events.markProcessedTx.mockResolvedValue({ count: 1 });

      const result = await service.processWebhook({});

      expect(result).toEqual({ status: 'processed' });
      expect(reservations.consumeAllForOrderTx).toHaveBeenCalledWith(tx, 'store-1', 'order-1');
    });
  });

  describe('payment resolution', () => {
    it('marks an unresolvable payment event as ERROR and returns a safe response', async () => {
      provider.verifyWebhookSignature.mockReturnValue(true);
      provider.parseWebhookEvent.mockReturnValue(successEvent);
      events.create.mockResolvedValue(eventRow);
      payments.findByGlobalId.mockResolvedValue(null);

      const result = await service.processWebhook({});

      expect(result).toEqual({ status: 'payment_unresolved' });
      expect(events.markError).toHaveBeenCalledWith('event-1', 'Payment could not be resolved.');
      expect(transaction.runWithTenant).not.toHaveBeenCalled();
    });
  });

  describe('successful payment', () => {
    it('applies SUCCEEDED: consume reservations + confirm order + audit + mark PROCESSED in one tx', async () => {
      withTx();
      provider.verifyWebhookSignature.mockReturnValue(true);
      provider.parseWebhookEvent.mockReturnValue(successEvent);
      events.create.mockResolvedValue(eventRow);
      payments.findByGlobalId.mockResolvedValue(paymentRow);
      payments.transitionStatus.mockResolvedValue({ count: 1 });
      attempts.findLatestForPayment.mockResolvedValue(attemptRow);
      attempts.transitionStatus.mockResolvedValue({ count: 1 });
      reservations.consumeAllForOrderTx.mockResolvedValue({ consumed: 1 });
      orders.findWithDetailsTx.mockResolvedValue(orderRow);
      orders.transitionStatus.mockResolvedValue({ count: 1 });
      events.markProcessedTx.mockResolvedValue({ count: 1 });

      const result = await service.processWebhook({});

      expect(result).toEqual({ status: 'processed' });
      // Tenant is derived server-side from the resolved payment.
      expect(transaction.runWithTenant).toHaveBeenCalledWith('store-1', expect.any(Function));
      expect(payments.transitionStatus).toHaveBeenCalledWith(
        tx,
        'store-1',
        'payment-1',
        PaymentStatus.PROCESSING,
        PaymentStatus.SUCCEEDED,
        expect.any(Object),
      );
      expect(attempts.transitionStatus).toHaveBeenCalledWith(
        tx,
        'payment-1',
        'attempt-1',
        PaymentStatus.PROCESSING,
        PaymentStatus.SUCCEEDED,
        expect.any(Object),
      );
      // Inventory owns consumption; the order lifecycle stays with Orders.
      expect(reservations.consumeAllForOrderTx).toHaveBeenCalledWith(tx, 'store-1', 'order-1');
      expect(orders.transitionStatus).toHaveBeenCalledWith(
        tx,
        'store-1',
        'order-1',
        OrderStatus.PENDING,
        OrderStatus.CONFIRMED,
        expect.objectContaining({ confirmedAt: expect.any(Date) }),
      );
      // Audit trail written in the same transaction.
      expect(audit.create).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ action: 'payment.succeeded', entityType: 'payment' }),
      );
      expect(audit.create).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ action: 'order.status_changed', entityType: 'order' }),
      );
      expect(events.markProcessedTx).toHaveBeenCalledWith(tx, 'event-1', 'store-1', 'payment-1');
    });

    it('is idempotent for an already-confirmed order (order transition skipped)', async () => {
      withTx();
      provider.verifyWebhookSignature.mockReturnValue(true);
      provider.parseWebhookEvent.mockReturnValue(successEvent);
      events.create.mockResolvedValue(eventRow);
      payments.findByGlobalId.mockResolvedValue(paymentRow);
      payments.transitionStatus.mockResolvedValue({ count: 0 });
      payments.findByIdTx.mockResolvedValue({ ...paymentRow, status: PaymentStatus.SUCCEEDED });
      attempts.transitionStatus.mockResolvedValue({ count: 0 });
      attempts.findLatestForPayment.mockResolvedValue({
        ...attemptRow,
        status: PaymentStatus.SUCCEEDED,
      });
      reservations.consumeAllForOrderTx.mockResolvedValue({ consumed: 0 });
      orders.findWithDetailsTx.mockResolvedValue({ ...orderRow, status: OrderStatus.CONFIRMED });
      events.markProcessedTx.mockResolvedValue({ count: 1 });

      const result = await service.processWebhook({});

      expect(result).toEqual({ status: 'processed' });
      // Already-confirmed order: no guarded order transition is attempted.
      expect(orders.transitionStatus).not.toHaveBeenCalled();
      expect(events.markProcessedTx).toHaveBeenCalled();
    });
  });

  describe('failed payment', () => {
    it('applies FAILED: release reservations + audit + mark PROCESSED; order stays PENDING', async () => {
      withTx();
      provider.verifyWebhookSignature.mockReturnValue(true);
      provider.parseWebhookEvent.mockReturnValue(failureEvent);
      events.create.mockResolvedValue(eventRow);
      payments.findByGlobalId.mockResolvedValue(paymentRow);
      payments.transitionStatus.mockResolvedValue({ count: 1 });
      attempts.findLatestForPayment.mockResolvedValue(attemptRow);
      attempts.transitionStatus.mockResolvedValue({ count: 1 });
      reservations.releaseAllForOrderTx.mockResolvedValue({ released: 1 });
      orders.findWithDetailsTx.mockResolvedValue(orderRow);
      events.markProcessedTx.mockResolvedValue({ count: 1 });

      const result = await service.processWebhook({});

      expect(result).toEqual({ status: 'processed' });
      expect(payments.transitionStatus).toHaveBeenCalledWith(
        tx,
        'store-1',
        'payment-1',
        PaymentStatus.PROCESSING,
        PaymentStatus.FAILED,
        expect.objectContaining({ failureMessage: 'Insufficient funds' }),
      );
      expect(reservations.releaseAllForOrderTx).toHaveBeenCalledWith(tx, 'store-1', 'order-1');
      // A failed payment never confirms the order.
      expect(orders.transitionStatus).not.toHaveBeenCalled();
      expect(audit.create).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ action: 'payment.failed', entityType: 'payment' }),
      );
      expect(events.markProcessedTx).toHaveBeenCalledWith(tx, 'event-1', 'store-1', 'payment-1');
    });
  });

  describe('cancelled payment', () => {
    it('never marks the order as paid: a cancelled/declined callback keeps the order PENDING', async () => {
      withTx();
      provider.verifyWebhookSignature.mockReturnValue(true);
      provider.parseWebhookEvent.mockReturnValue({
        ...successEvent,
        success: false,
        failureMessage: 'Transaction cancelled by customer.',
      });
      events.create.mockResolvedValue(eventRow);
      payments.findByGlobalId.mockResolvedValue(paymentRow);
      payments.transitionStatus.mockResolvedValue({ count: 1 });
      attempts.findLatestForPayment.mockResolvedValue(attemptRow);
      attempts.transitionStatus.mockResolvedValue({ count: 1 });
      reservations.releaseAllForOrderTx.mockResolvedValue({ released: 1 });
      orders.findWithDetailsTx.mockResolvedValue(orderRow);
      events.markProcessedTx.mockResolvedValue({ count: 1 });

      const result = await service.processWebhook({});

      expect(result).toEqual({ status: 'processed' });
      // Payment is FAILED — never SUCCEEDED.
      expect(payments.transitionStatus).toHaveBeenCalledWith(
        tx,
        'store-1',
        'payment-1',
        PaymentStatus.PROCESSING,
        PaymentStatus.FAILED,
        expect.objectContaining({ failureMessage: 'Transaction cancelled by customer.' }),
      );
      // The order is NOT confirmed and reservations are released for retry.
      expect(orders.transitionStatus).not.toHaveBeenCalled();
      expect(reservations.consumeAllForOrderTx).not.toHaveBeenCalled();
      expect(reservations.releaseAllForOrderTx).toHaveBeenCalledWith(tx, 'store-1', 'order-1');
      // A replay of the same cancelled callback is a dedup no-op (no new effects).
      events.create.mockRejectedValue(prismaUniqueError());
      events.findByProviderEventId.mockResolvedValue({
        ...eventRow,
        processingStatus: EventProcessingStatus.PROCESSED,
      });
      const replay = await service.processWebhook({});
      expect(replay).toEqual({ status: 'already_processed' });
      expect(payments.transitionStatus).toHaveBeenCalledTimes(1);
      expect(orders.transitionStatus).not.toHaveBeenCalled();
    });
  });

  describe('pending transaction', () => {
    it('marks the event PROCESSED without terminal transitions', async () => {
      withTx();
      provider.verifyWebhookSignature.mockReturnValue(true);
      provider.parseWebhookEvent.mockReturnValue({ ...successEvent, pending: true });
      events.create.mockResolvedValue(eventRow);
      payments.findByGlobalId.mockResolvedValue(paymentRow);
      orders.findWithDetailsTx.mockResolvedValue(orderRow);
      events.markProcessedTx.mockResolvedValue({ count: 1 });

      const result = await service.processWebhook({});

      expect(result).toEqual({ status: 'processed' });
      expect(payments.transitionStatus).not.toHaveBeenCalled();
      expect(reservations.consumeAllForOrderTx).not.toHaveBeenCalled();
      expect(events.markProcessedTx).toHaveBeenCalledWith(tx, 'event-1', 'store-1', 'payment-1');
    });
  });
});

function prismaUniqueError(): unknown {
  return new Prisma.PrismaClientKnownRequestError('unique violation', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: ['provider_event_id'] },
  });
}
