import { OrderStatus, PaymentStatus } from '@prisma/client';
import { RequestContextService } from '../../common/context/request-context.service';
import {
  ConflictError,
  IdempotencyConflictError,
  NotFoundError,
  StateTransitionError,
  TenantContextRequiredError,
  ValidationError,
} from '../../common/errors/domain-exceptions';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { OrderRepository } from '../../orders/repositories/order.repository';
import { PaymentAttemptRepository } from '../repositories/payment-attempt.repository';
import { PaymentRepository } from '../repositories/payment.repository';
import { PaymentProvider } from '../providers/payment-provider';
import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  let requestContext: { getCurrent: jest.Mock };
  let orders: { findWithDetails: jest.Mock };
  let payments: {
    findByIdempotencyKey: jest.Mock;
    findNonFailedForOrder: jest.Mock;
    create: jest.Mock;
    findById: jest.Mock;
    findLatestForOrder: jest.Mock;
    transitionStatus: jest.Mock;
  };
  let attempts: { create: jest.Mock; findLatestForPayment: jest.Mock; transitionStatus: jest.Mock };
  let provider: { initiatePayment: jest.Mock };
  let transaction: { runWithTenant: jest.Mock };
  let service: PaymentsService;

  const tx = {} as never;

  const orderRow = {
    id: 'order-1',
    storeId: 'store-1',
    orderNumber: 'ORD-2026-000001',
    status: OrderStatus.PENDING,
    currency: 'EGP',
    subtotal: 1000n,
    discountTotal: 0n,
    shippingTotal: 0n,
    taxTotal: 0n,
    grandTotal: 1000n,
    customerEmail: 'ahmed@example.com',
    customerPhone: '01000000000',
    shippingAddressSnapshot: { governorate: 'Gharbia', city: 'Tanta', addressLine: 'St 5' },
    items: [],
    reservations: [],
  };

  const paymentRow = {
    id: 'payment-1',
    storeId: 'store-1',
    orderId: 'order-1',
    status: PaymentStatus.PENDING,
    provider: 'paymob',
    providerReference: null,
    amount: 1000n,
    currency: 'EGP',
    idempotencyKey: 'key-1',
    failureCode: null,
    failureMessage: null,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const attemptRow = {
    id: 'attempt-1',
    paymentId: 'payment-1',
    status: PaymentStatus.PENDING,
    providerReference: null,
    idempotencyKey: 'key-1',
    amount: 1000n,
    currency: 'EGP',
    failureCode: null,
    failureMessage: null,
    initiatedAt: null,
    completedAt: null,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  function withContext(userAuthId = 'auth-user-1') {
    requestContext.getCurrent.mockReturnValue({
      store: { id: 'store-1' },
      user: { authUserId: userAuthId },
    });
  }

  describe('createPayment', () => {
    it('fails closed without a tenant context', async () => {
      requestContext.getCurrent.mockReturnValue({});
      await expect(service.createPayment('order-1', 'key-1')).rejects.toBeInstanceOf(
        TenantContextRequiredError,
      );
    });

    it('requires an Idempotency-Key', async () => {
      withContext();
      await expect(service.createPayment('order-1', undefined)).rejects.toBeInstanceOf(
        ValidationError,
      );
    });

    it('returns NOT_FOUND for a missing/foreign order', async () => {
      withContext();
      orders.findWithDetails.mockResolvedValue(null);

      await expect(service.createPayment('order-missing', 'key-1')).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('rejects payment for a non-PENDING order (STATE_TRANSITION)', async () => {
      withContext();
      orders.findWithDetails.mockResolvedValue({ ...orderRow, status: OrderStatus.CANCELLED });

      await expect(service.createPayment('order-1', 'key-1')).rejects.toBeInstanceOf(
        StateTransitionError,
      );
      expect(provider.initiatePayment).not.toHaveBeenCalled();
    });

    it('replays an idempotency key against the same order without calling the provider', async () => {
      withContext();
      orders.findWithDetails.mockResolvedValue(orderRow);
      payments.findByIdempotencyKey.mockResolvedValue(paymentRow);
      payments.findById.mockResolvedValue(paymentRow);
      attempts.findLatestForPayment.mockResolvedValue(attemptRow);

      const result = await service.createPayment('order-1', 'key-1');

      expect(payments.create).not.toHaveBeenCalled();
      expect(provider.initiatePayment).not.toHaveBeenCalled();
      expect(result.id).toBe('payment-1');
      expect(result.status).toBe(PaymentStatus.PENDING);
    });

    it('rejects an idempotency key already used for a different order', async () => {
      withContext();
      orders.findWithDetails.mockResolvedValue(orderRow);
      payments.findByIdempotencyKey.mockResolvedValue({ ...paymentRow, orderId: 'order-other' });

      await expect(service.createPayment('order-1', 'key-1')).rejects.toBeInstanceOf(
        IdempotencyConflictError,
      );
    });

    it('blocks initiation while a non-FAILED payment exists (CONFLICT)', async () => {
      withContext();
      orders.findWithDetails.mockResolvedValue(orderRow);
      payments.findByIdempotencyKey.mockResolvedValue(null);
      payments.findNonFailedForOrder.mockResolvedValue(paymentRow);

      await expect(service.createPayment('order-1', 'key-1')).rejects.toBeInstanceOf(ConflictError);
      expect(payments.create).not.toHaveBeenCalled();
    });
  });

  function withTx() {
    transaction.runWithTenant.mockImplementation(
      async (_storeId: string, work: (t: never) => Promise<unknown>) => work(tx),
    );
  }

  beforeEach(() => {
    requestContext = { getCurrent: jest.fn() };
    orders = { findWithDetails: jest.fn() };
    payments = {
      findByIdempotencyKey: jest.fn(),
      findNonFailedForOrder: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
      findLatestForOrder: jest.fn(),
      transitionStatus: jest.fn(),
    };
    attempts = { create: jest.fn(), findLatestForPayment: jest.fn(), transitionStatus: jest.fn() };
    provider = { initiatePayment: jest.fn() };
    transaction = { runWithTenant: jest.fn() };

    service = new PaymentsService(
      requestContext as unknown as RequestContextService,
      orders as unknown as OrderRepository,
      payments as unknown as PaymentRepository,
      attempts as unknown as PaymentAttemptRepository,
      provider as unknown as PaymentProvider,
      transaction as unknown as TransactionService,
    );
  });

  describe('createPayment success + provider flow', () => {
    it('creates payment + attempt PENDING, initiates the provider, then marks PROCESSING', async () => {
      withContext();
      withTx();
      orders.findWithDetails.mockResolvedValue(orderRow);
      payments.findByIdempotencyKey.mockResolvedValue(null);
      payments.findNonFailedForOrder.mockResolvedValue(null);
      payments.create.mockResolvedValue(paymentRow);
      attempts.create.mockResolvedValue(attemptRow);
      provider.initiatePayment.mockResolvedValue({
        providerReference: 'pm-order-1',
        providerCheckoutUrl: 'https://iframe?token=x',
      });
      payments.transitionStatus.mockResolvedValue({ count: 1 });
      attempts.transitionStatus.mockResolvedValue({ count: 1 });
      payments.findById.mockResolvedValue({ ...paymentRow, status: PaymentStatus.PROCESSING });
      attempts.findLatestForPayment.mockResolvedValue({
        ...attemptRow,
        status: PaymentStatus.PROCESSING,
      });

      const result = await service.createPayment('order-1', 'key-1');

      // Amount/currency come from the order, never from the client.
      expect(payments.create).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          storeId: 'store-1',
          orderId: 'order-1',
          amount: 1000n,
          currency: 'EGP',
          provider: 'paymob',
        }),
      );
      expect(attempts.create).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ paymentId: 'payment-1', amount: 1000n, currency: 'EGP' }),
      );
      expect(provider.initiatePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentId: 'payment-1',
          orderId: 'order-1',
          orderNumber: 'ORD-2026-000001',
          amount: 1000n,
          currency: 'EGP',
        }),
      );
      // Guarded PENDING -> PROCESSING on both payment and attempt.
      expect(payments.transitionStatus).toHaveBeenCalledWith(
        tx,
        'store-1',
        'payment-1',
        PaymentStatus.PENDING,
        PaymentStatus.PROCESSING,
        { providerReference: 'pm-order-1' },
      );
      expect(attempts.transitionStatus).toHaveBeenCalledWith(
        tx,
        'payment-1',
        'attempt-1',
        PaymentStatus.PENDING,
        PaymentStatus.PROCESSING,
        expect.objectContaining({ providerReference: 'pm-order-1' }),
      );
      expect(result.status).toBe(PaymentStatus.PROCESSING);
      expect(result.providerCheckoutUrl).toBe('https://iframe?token=x');
    });

    it('marks payment + attempt FAILED when provider initiation fails and rethrows', async () => {
      withContext();
      withTx();
      orders.findWithDetails.mockResolvedValue(orderRow);
      payments.findByIdempotencyKey.mockResolvedValue(null);
      payments.findNonFailedForOrder.mockResolvedValue(null);
      payments.create.mockResolvedValue(paymentRow);
      attempts.create.mockResolvedValue(attemptRow);
      provider.initiatePayment.mockRejectedValue(new ConflictError('Payment initiation failed.'));
      payments.transitionStatus.mockResolvedValue({ count: 1 });
      attempts.transitionStatus.mockResolvedValue({ count: 1 });

      await expect(service.createPayment('order-1', 'key-1')).rejects.toBeInstanceOf(ConflictError);

      // Documented failure flow PENDING -> PROCESSING -> FAILED in one tx.
      expect(payments.transitionStatus).toHaveBeenCalledWith(
        tx,
        'store-1',
        'payment-1',
        PaymentStatus.PENDING,
        PaymentStatus.PROCESSING,
      );
      expect(payments.transitionStatus).toHaveBeenCalledWith(
        tx,
        'store-1',
        'payment-1',
        PaymentStatus.PROCESSING,
        PaymentStatus.FAILED,
        expect.objectContaining({ failureCode: 'INITIATION_FAILED' }),
      );
      expect(attempts.transitionStatus).toHaveBeenCalledWith(
        tx,
        'payment-1',
        'attempt-1',
        PaymentStatus.PROCESSING,
        PaymentStatus.FAILED,
        expect.objectContaining({ failureCode: 'INITIATION_FAILED' }),
      );
    });
  });

  describe('getPayment', () => {
    it('returns NOT_FOUND for a missing order', async () => {
      withContext();
      orders.findWithDetails.mockResolvedValue(null);

      await expect(service.getPayment('order-missing')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('returns NOT_FOUND when no payment exists for the order', async () => {
      withContext();
      orders.findWithDetails.mockResolvedValue(orderRow);
      payments.findLatestForOrder.mockResolvedValue(null);

      await expect(service.getPayment('order-1')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('returns the active payment view with attempts', async () => {
      withContext();
      orders.findWithDetails.mockResolvedValue(orderRow);
      payments.findLatestForOrder.mockResolvedValue(paymentRow);
      payments.findById.mockResolvedValue(paymentRow);
      attempts.findLatestForPayment.mockResolvedValue(attemptRow);

      const result = await service.getPayment('order-1');

      expect(result.id).toBe('payment-1');
      expect(result.attempts).toHaveLength(1);
      expect(payments.findLatestForOrder).toHaveBeenCalledWith('store-1', 'order-1');
    });
  });
});
