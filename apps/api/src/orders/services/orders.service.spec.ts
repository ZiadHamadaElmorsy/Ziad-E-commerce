import { OrderStatus, Prisma } from '@prisma/client';
import { RequestContextService } from '../../common/context/request-context.service';
import {
  ConflictError,
  NotFoundError,
  StateTransitionError,
  TenantContextRequiredError,
} from '../../common/errors/domain-exceptions';
import { UserRepository } from '../../identity/repositories/user.repository';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { InventoryReservationService } from '../../inventory/services/inventory-reservation.service';
import { ListOrdersQueryDto } from '../dto/list-orders-query.dto';
import { UpdateOrderStatusDto } from '../dto/update-order-status.dto';
import { AuditLogRepository } from '../repositories/audit-log.repository';
import { OrderRepository } from '../repositories/order.repository';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  let requestContext: { getCurrent: jest.Mock };
  let orders: {
    findWithDetails: jest.Mock;
    findWithDetailsTx: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    transitionStatus: jest.Mock;
  };
  let audit: { create: jest.Mock };
  let users: { findByAuthUserIdTx: jest.Mock };
  let reservations: { releaseAllForOrderTx: jest.Mock };
  let transaction: { runWithTenant: jest.Mock };
  let service: OrdersService;

  /** Transaction client — unused directly because every tx delegate is mocked. */
  const tx = {} as never;

  const orderRow = {
    id: 'order-1',
    storeId: 'store-1',
    orderNumber: 'ORD-2026-000001',
    customerId: 'customer-1',
    status: OrderStatus.PENDING,
    currency: 'EGP',
    subtotal: 1000n,
    discountTotal: 0n,
    shippingTotal: 0n,
    taxTotal: 0n,
    grandTotal: 1000n,
    customerEmail: 'ahmed@example.com',
    customerPhone: '01000000000',
    shippingAddressSnapshot: { governorate: 'Gharbia', city: 'Tanta', addressLine: 'Street 5' },
    billingAddressSnapshot: null,
    idempotencyKey: 'key-1',
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
    confirmedAt: null,
    cancelledAt: null,
  };

  const orderItemRow = {
    id: 'oi-1',
    orderId: 'order-1',
    productId: 'product-1',
    variantId: 'variant-1',
    productNameSnapshot: 'Classic T-Shirt',
    variantNameSnapshot: 'Classic T-Shirt',
    skuSnapshot: 'TS-BLK-M',
    unitPrice: 500n,
    quantity: 2,
    lineTotal: 1000n,
    createdAt: new Date('2026-08-12T00:00:00Z'),
  };

  const reservationRow = {
    id: 'res-1',
    storeId: 'store-1',
    variantId: 'variant-1',
    cartId: 'cart-1',
    orderId: 'order-1',
    quantity: 2,
    status: 'ACTIVE',
    expiresAt: null,
    releasedAt: null,
    consumedAt: null,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const orderWithDetails = { ...orderRow, items: [orderItemRow], reservations: [reservationRow] };

  /** Runs the transaction work inline (matching TransactionService.runWithTenant). */
  function withTx() {
    transaction.runWithTenant.mockImplementation(
      async (_storeId: string, work: (t: never) => Promise<unknown>) => work(tx),
    );
  }

  /** A resolved tenant context (authenticated merchant in store-1). */
  function withContext(userAuthId = 'auth-user-1') {
    requestContext.getCurrent.mockReturnValue({
      store: { id: 'store-1' },
      user: { authUserId: userAuthId },
    });
  }

  function buildUpdateDto(status: OrderStatus): UpdateOrderStatusDto {
    const dto = new UpdateOrderStatusDto();
    dto.status = status;
    return dto;
  }

  beforeEach(() => {
    requestContext = { getCurrent: jest.fn() };
    orders = {
      findWithDetails: jest.fn(),
      findWithDetailsTx: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      transitionStatus: jest.fn(),
    };
    audit = { create: jest.fn() };
    users = { findByAuthUserIdTx: jest.fn() };
    reservations = { releaseAllForOrderTx: jest.fn() };
    transaction = { runWithTenant: jest.fn() };

    service = new OrdersService(
      requestContext as unknown as RequestContextService,
      orders as unknown as OrderRepository,
      audit as unknown as AuditLogRepository,
      users as unknown as UserRepository,
      reservations as unknown as InventoryReservationService,
      transaction as unknown as TransactionService,
    );
  });

  describe('list', () => {
    it('is store-scoped and applies the documented filters (dates parsed to Dates)', async () => {
      withContext();
      orders.findMany.mockResolvedValue([orderRow]);
      orders.count.mockResolvedValue(1);
      const query = new ListOrdersQueryDto();
      query.status = OrderStatus.PENDING;
      query.search = 'ORD';
      query.dateFrom = '2026-08-01T00:00:00.000Z';
      query.dateTo = '2026-08-31T23:59:59.000Z';
      query.page = 2;
      query.limit = 10;

      const result = await service.list(query);

      expect(orders.findMany).toHaveBeenCalledWith('store-1', {
        status: OrderStatus.PENDING,
        search: 'ORD',
        dateFrom: new Date('2026-08-01T00:00:00.000Z'),
        dateTo: new Date('2026-08-31T23:59:59.000Z'),
        skip: 10,
        take: 10,
        orderBy: { createdAt: 'desc' },
      });
      expect(orders.count).toHaveBeenCalledWith('store-1', expect.anything());
      expect(result.meta).toEqual({ page: 2, limit: 10, total: 1, totalPages: 1 });
      expect(result.items[0]).toMatchObject({
        id: 'order-1',
        orderNumber: 'ORD-2026-000001',
        status: OrderStatus.PENDING,
        grandTotal: 1000,
      });
    });

    it('fails closed without a tenant context', async () => {
      requestContext.getCurrent.mockReturnValue({});

      await expect(service.list(new ListOrdersQueryDto())).rejects.toBeInstanceOf(
        TenantContextRequiredError,
      );
    });
  });

  describe('get', () => {
    it('returns the order built from purchase-time snapshots', async () => {
      withContext();
      orders.findWithDetails.mockResolvedValue(orderWithDetails);

      const result = await service.get('order-1');

      expect(orders.findWithDetails).toHaveBeenCalledWith('store-1', 'order-1');
      expect(result).toMatchObject({
        id: 'order-1',
        orderNumber: 'ORD-2026-000001',
        status: OrderStatus.PENDING,
        subtotal: 1000,
        grandTotal: 1000,
        customerEmail: 'ahmed@example.com',
        customerPhone: '01000000000',
        shippingAddress: { governorate: 'Gharbia', city: 'Tanta', addressLine: 'Street 5' },
        billingAddress: null,
        confirmedAt: null,
        cancelledAt: null,
        items: [
          {
            id: 'oi-1',
            productName: 'Classic T-Shirt',
            variantName: 'Classic T-Shirt',
            sku: 'TS-BLK-M',
            unitPrice: 500,
            quantity: 2,
            lineTotal: 1000,
          },
        ],
        reservations: [{ id: 'res-1', variantId: 'variant-1', quantity: 2, status: 'ACTIVE' }],
      });
    });

    it('throws NOT_FOUND for a missing or foreign order (no existence leak)', async () => {
      withContext();
      orders.findWithDetails.mockResolvedValue(null);

      await expect(service.get('order-foreign')).rejects.toBeInstanceOf(NotFoundError);
      expect(orders.findWithDetails).toHaveBeenCalledWith('store-1', 'order-foreign');
    });
  });

  describe('updateStatus', () => {
    it('applies a documented transition with a guarded update inside the tenant-bound transaction', async () => {
      withContext();
      withTx();
      orders.findWithDetails.mockResolvedValue(orderWithDetails);
      orders.transitionStatus.mockResolvedValue({ count: 1 });
      users.findByAuthUserIdTx.mockResolvedValue({ id: 'user-1' });
      orders.findWithDetailsTx.mockResolvedValue({
        ...orderWithDetails,
        status: OrderStatus.CONFIRMED,
        confirmedAt: new Date('2026-08-13T10:00:00Z'),
      });

      const result = await service.updateStatus('order-1', buildUpdateDto(OrderStatus.CONFIRMED));

      expect(transaction.runWithTenant).toHaveBeenCalledWith('store-1', expect.any(Function));
      expect(orders.transitionStatus).toHaveBeenCalledWith(
        tx,
        'store-1',
        'order-1',
        OrderStatus.PENDING,
        OrderStatus.CONFIRMED,
        expect.objectContaining({ confirmedAt: expect.any(Date) }),
      );
      // No reservation release for a non-cancellation transition.
      expect(reservations.releaseAllForOrderTx).not.toHaveBeenCalled();
      // Every successful status change is audited (US-ORDER-003).
      expect(audit.create).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          storeId: 'store-1',
          userId: 'user-1',
          action: 'order.status_changed',
          entityType: 'order',
          entityId: 'order-1',
          metadata: {
            orderNumber: 'ORD-2026-000001',
            from: OrderStatus.PENDING,
            to: OrderStatus.CONFIRMED,
          },
        }),
      );
      expect(result.status).toBe(OrderStatus.CONFIRMED);
      expect(result.confirmedAt).toBe('2026-08-13T10:00:00.000Z');
    });

    // PHASE 10 — SHIPPING & FULFILLMENT / DELIVERY. The FINAL documents
    // represent shipping/fulfillment/delivery entirely through the Order
    // lifecycle (DATABASE §7.16: PROCESSING -> SHIPPED -> DELIVERED, "there is
    // NO separate fulfillment state machine"). These tests pin the shipping and
    // delivery transitions on the OrdersService mechanism reserved by the FINAL
    // documents (docs/IMPLEMENTATION-PHASE9-PAYMENTS.md §27): no separate
    // shipment/fulfillment/delivery entities exist and none are invented.
    it('applies the documented PROCESSING -> SHIPPED transition (shipping) with audit and no inventory/payment effects', async () => {
      withContext();
      withTx();
      orders.findWithDetails.mockResolvedValue({
        ...orderWithDetails,
        status: OrderStatus.PROCESSING,
      });
      orders.transitionStatus.mockResolvedValue({ count: 1 });
      users.findByAuthUserIdTx.mockResolvedValue({ id: 'user-1' });
      orders.findWithDetailsTx.mockResolvedValue({
        ...orderWithDetails,
        status: OrderStatus.SHIPPED,
      });

      const result = await service.updateStatus('order-1', buildUpdateDto(OrderStatus.SHIPPED));

      // Guarded, store-scoped conditional update (DATABASE §26.2/§28.4).
      expect(orders.transitionStatus).toHaveBeenCalledWith(
        tx,
        'store-1',
        'order-1',
        OrderStatus.PROCESSING,
        OrderStatus.SHIPPED,
        // No lifecycle timestamp is documented for SHIPPED (DATABASE §7.16
        // defines only confirmed_at/cancelled_at); nothing extra is written.
        expect.objectContaining({}),
      );
      // Inventory boundary: shipping never consumes/releases reservations or
      // mutates stock (reservation effects are owned by cancellation and
      // payment outcomes — DATABASE §27.1/§28.2/§28.4).
      expect(reservations.releaseAllForOrderTx).not.toHaveBeenCalled();
      // Every successful status change is audited (US-ORDER-003).
      expect(audit.create).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          storeId: 'store-1',
          userId: 'user-1',
          action: 'order.status_changed',
          entityType: 'order',
          entityId: 'order-1',
          metadata: {
            orderNumber: 'ORD-2026-000001',
            from: OrderStatus.PROCESSING,
            to: OrderStatus.SHIPPED,
          },
        }),
      );
      expect(result.status).toBe(OrderStatus.SHIPPED);
    });

    it('applies the documented SHIPPED -> DELIVERED transition (delivery) with audit and no inventory/payment effects', async () => {
      withContext();
      withTx();
      orders.findWithDetails.mockResolvedValue({
        ...orderWithDetails,
        status: OrderStatus.SHIPPED,
      });
      orders.transitionStatus.mockResolvedValue({ count: 1 });
      users.findByAuthUserIdTx.mockResolvedValue({ id: 'user-1' });
      orders.findWithDetailsTx.mockResolvedValue({
        ...orderWithDetails,
        status: OrderStatus.DELIVERED,
      });

      const result = await service.updateStatus('order-1', buildUpdateDto(OrderStatus.DELIVERED));

      expect(orders.transitionStatus).toHaveBeenCalledWith(
        tx,
        'store-1',
        'order-1',
        OrderStatus.SHIPPED,
        OrderStatus.DELIVERED,
        expect.objectContaining({}),
      );
      // Delivery completion is a pure lifecycle transition: no reservation
      // release/consumption and no inventory movement are written here.
      expect(reservations.releaseAllForOrderTx).not.toHaveBeenCalled();
      expect(audit.create).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          storeId: 'store-1',
          userId: 'user-1',
          action: 'order.status_changed',
          entityType: 'order',
          entityId: 'order-1',
          metadata: {
            orderNumber: 'ORD-2026-000001',
            from: OrderStatus.SHIPPED,
            to: OrderStatus.DELIVERED,
          },
        }),
      );
      expect(result.status).toBe(OrderStatus.DELIVERED);
    });

    it('cancellation releases ACTIVE reservations and writes the order.cancelled audit row in the same transaction', async () => {
      withContext();
      withTx();
      orders.findWithDetails.mockResolvedValue(orderWithDetails);
      orders.transitionStatus.mockResolvedValue({ count: 1 });
      reservations.releaseAllForOrderTx.mockResolvedValue({ released: 1 });
      users.findByAuthUserIdTx.mockResolvedValue({ id: 'user-1' });
      orders.findWithDetailsTx.mockResolvedValue({
        ...orderWithDetails,
        status: OrderStatus.CANCELLED,
        cancelledAt: new Date('2026-08-13T10:00:00Z'),
      });

      const result = await service.updateStatus('order-1', buildUpdateDto(OrderStatus.CANCELLED));

      expect(reservations.releaseAllForOrderTx).toHaveBeenCalledWith(tx, 'store-1', 'order-1');
      expect(audit.create).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          storeId: 'store-1',
          userId: 'user-1',
          action: 'order.cancelled',
          entityType: 'order',
          entityId: 'order-1',
          metadata: {
            orderNumber: 'ORD-2026-000001',
            from: OrderStatus.PENDING,
            to: OrderStatus.CANCELLED,
          },
        }),
      );
      expect(result.status).toBe(OrderStatus.CANCELLED);
      expect(result.cancelledAt).toBe('2026-08-13T10:00:00.000Z');
    });

    it('records a NULL audit actor when the authenticated user cannot be resolved', async () => {
      withContext('unknown-auth-user');
      withTx();
      orders.findWithDetails.mockResolvedValue(orderWithDetails);
      orders.transitionStatus.mockResolvedValue({ count: 1 });
      users.findByAuthUserIdTx.mockResolvedValue(null);
      orders.findWithDetailsTx.mockResolvedValue({
        ...orderWithDetails,
        status: OrderStatus.CONFIRMED,
        confirmedAt: new Date('2026-08-13T10:00:00Z'),
      });

      await service.updateStatus('order-1', buildUpdateDto(OrderStatus.CONFIRMED));

      expect(audit.create).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ storeId: 'store-1', userId: null }),
      );
    });
  });

  describe('updateStatus rejections', () => {
    it('rejects an illegal lifecycle transition before any write', async () => {
      withContext();
      orders.findWithDetails.mockResolvedValue({
        ...orderWithDetails,
        status: OrderStatus.PROCESSING,
      });

      await expect(
        service.updateStatus('order-1', buildUpdateDto(OrderStatus.CONFIRMED)),
      ).rejects.toBeInstanceOf(StateTransitionError);

      expect(transaction.runWithTenant).not.toHaveBeenCalled();
      expect(orders.transitionStatus).not.toHaveBeenCalled();
      expect(audit.create).not.toHaveBeenCalled();
    });

    it('rejects forward-state skipping (PENDING -> PROCESSING)', async () => {
      withContext();
      orders.findWithDetails.mockResolvedValue(orderWithDetails);

      await expect(
        service.updateStatus('order-1', buildUpdateDto(OrderStatus.PROCESSING)),
      ).rejects.toBeInstanceOf(StateTransitionError);
      expect(transaction.runWithTenant).not.toHaveBeenCalled();
    });

    it('protects terminal states (CANCELLED cannot move and cannot be cancelled again)', async () => {
      withContext();
      orders.findWithDetails.mockResolvedValue({
        ...orderWithDetails,
        status: OrderStatus.CANCELLED,
        cancelledAt: new Date('2026-08-12T00:00:00Z'),
      });

      await expect(
        service.updateStatus('order-1', buildUpdateDto(OrderStatus.PROCESSING)),
      ).rejects.toBeInstanceOf(StateTransitionError);
      await expect(
        service.updateStatus('order-1', buildUpdateDto(OrderStatus.CANCELLED)),
      ).rejects.toBeInstanceOf(StateTransitionError);
      expect(transaction.runWithTenant).not.toHaveBeenCalled();
    });

    it('protects the DELIVERED terminal state', async () => {
      withContext();
      orders.findWithDetails.mockResolvedValue({
        ...orderWithDetails,
        status: OrderStatus.DELIVERED,
      });

      await expect(
        service.updateStatus('order-1', buildUpdateDto(OrderStatus.SHIPPED)),
      ).rejects.toBeInstanceOf(StateTransitionError);
      await expect(
        service.updateStatus('order-1', buildUpdateDto(OrderStatus.CANCELLED)),
      ).rejects.toBeInstanceOf(StateTransitionError);
      expect(transaction.runWithTenant).not.toHaveBeenCalled();
    });

    // PHASE 10 — repeated/duplicate shipping & delivery operations are rejected
    // by the documented state machine BEFORE any write (no arbitrary or self
    // transitions — DOMAIN-MODEL §12.3). This is the FINAL-documented
    // idempotency behavior for a replayed SHIPPED/DELIVERED request: the guard
    // fails closed and nothing is written or audited.
    it('rejects a repeated SHIPPED request (self-transition) before any write', async () => {
      withContext();
      orders.findWithDetails.mockResolvedValue({
        ...orderWithDetails,
        status: OrderStatus.SHIPPED,
      });

      await expect(
        service.updateStatus('order-1', buildUpdateDto(OrderStatus.SHIPPED)),
      ).rejects.toBeInstanceOf(StateTransitionError);
      expect(transaction.runWithTenant).not.toHaveBeenCalled();
      expect(orders.transitionStatus).not.toHaveBeenCalled();
      expect(audit.create).not.toHaveBeenCalled();
    });

    it('rejects a repeated DELIVERED request (self-transition) before any write', async () => {
      withContext();
      orders.findWithDetails.mockResolvedValue({
        ...orderWithDetails,
        status: OrderStatus.DELIVERED,
      });

      await expect(
        service.updateStatus('order-1', buildUpdateDto(OrderStatus.DELIVERED)),
      ).rejects.toBeInstanceOf(StateTransitionError);
      expect(transaction.runWithTenant).not.toHaveBeenCalled();
      expect(orders.transitionStatus).not.toHaveBeenCalled();
      expect(audit.create).not.toHaveBeenCalled();
    });

    it('fails closed with STATE_TRANSITION when a guarded SHIPPED -> DELIVERED update affects zero rows (concurrent change)', async () => {
      withContext();
      withTx();
      orders.findWithDetails.mockResolvedValue({
        ...orderWithDetails,
        status: OrderStatus.SHIPPED,
      });
      orders.transitionStatus.mockResolvedValue({ count: 0 });

      await expect(
        service.updateStatus('order-1', buildUpdateDto(OrderStatus.DELIVERED)),
      ).rejects.toBeInstanceOf(StateTransitionError);
      expect(audit.create).not.toHaveBeenCalled();
    });

    it('throws NOT_FOUND for a missing order without touching the transaction', async () => {
      withContext();
      orders.findWithDetails.mockResolvedValue(null);

      await expect(
        service.updateStatus('order-foreign', buildUpdateDto(OrderStatus.CONFIRMED)),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(transaction.runWithTenant).not.toHaveBeenCalled();
    });

    it('fails closed with STATE_TRANSITION when the guarded update affects zero rows (concurrent change)', async () => {
      withContext();
      withTx();
      orders.findWithDetails.mockResolvedValue(orderWithDetails);
      orders.transitionStatus.mockResolvedValue({ count: 0 });

      await expect(
        service.updateStatus('order-1', buildUpdateDto(OrderStatus.CONFIRMED)),
      ).rejects.toBeInstanceOf(StateTransitionError);
      expect(audit.create).not.toHaveBeenCalled();
    });

    it('maps Prisma write errors deterministically', async () => {
      withContext();
      withTx();
      orders.findWithDetails.mockResolvedValue(orderWithDetails);
      orders.transitionStatus.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.updateStatus('order-1', buildUpdateDto(OrderStatus.CONFIRMED)),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });
});
