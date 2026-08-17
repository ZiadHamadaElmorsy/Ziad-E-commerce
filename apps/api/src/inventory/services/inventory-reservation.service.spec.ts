import { MovementType, ReservationStatus, VariantStatus } from '@prisma/client';
import { RequestContextService } from '../../common/context/request-context.service';
import {
  ConflictError,
  InsufficientInventoryError,
  NotFoundError,
  StateTransitionError,
  TenantContextRequiredError,
  ValidationError,
} from '../../common/errors/domain-exceptions';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { ProductVariantRepository } from '../../catalog/repositories/product-variant.repository';
import { InventoryMovementRepository } from '../repositories/inventory-movement.repository';
import { InventoryReservationRepository } from '../repositories/inventory-reservation.repository';
import { InventoryRepository } from '../repositories/inventory.repository';
import { InventoryReservationService } from './inventory-reservation.service';

describe('InventoryReservationService', () => {
  let requestContext: { getCurrent: jest.Mock };
  let variants: { findById: jest.Mock };
  let inventory: {
    findByVariantTx: jest.Mock;
    guardedReserve: jest.Mock;
    guardedConsume: jest.Mock;
    guardedRelease: jest.Mock;
    guardedRestock: jest.Mock;
  };
  let reservations: {
    create: jest.Mock;
    findById: jest.Mock;
    findByIdTx: jest.Mock;
    transitionStatus: jest.Mock;
    findDueForExpiration: jest.Mock;
    findActiveByOrderTx: jest.Mock;
  };
  let movements: { create: jest.Mock };
  let transaction: { runWithTenant: jest.Mock };
  let service: InventoryReservationService;

  const variantRow = {
    id: 'variant-1',
    storeId: 'store-1',
    productId: 'product-1',
    name: 'Classic T-Shirt',
    sku: null,
    price: 0n,
    compareAtPrice: null,
    costPrice: null,
    status: VariantStatus.ACTIVE,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const inventoryRow = {
    id: 'inv-1',
    storeId: 'store-1',
    variantId: 'variant-1',
    onHandQuantity: 10,
    reservedQuantity: 5,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const reservationRow = {
    id: 'res-1',
    storeId: 'store-1',
    variantId: 'variant-1',
    cartId: 'cart-1',
    orderId: null,
    quantity: 5,
    status: ReservationStatus.ACTIVE,
    expiresAt: new Date('2026-08-13T00:00:00Z'),
    releasedAt: null,
    consumedAt: null,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  beforeEach(() => {
    requestContext = { getCurrent: jest.fn() };
    variants = { findById: jest.fn() };
    inventory = {
      findByVariantTx: jest.fn(),
      guardedReserve: jest.fn(),
      guardedConsume: jest.fn(),
      guardedRelease: jest.fn(),
      guardedRestock: jest.fn(),
    };
    reservations = {
      create: jest.fn(),
      findById: jest.fn(),
      findByIdTx: jest.fn(),
      transitionStatus: jest.fn(),
      findDueForExpiration: jest.fn(),
      findActiveByOrderTx: jest.fn(),
    };
    movements = { create: jest.fn() };
    transaction = { runWithTenant: jest.fn() };

    transaction.runWithTenant.mockImplementation(
      async (_storeId: string, work: (tx: unknown) => Promise<unknown>) => work({}),
    );

    service = new InventoryReservationService(
      requestContext as unknown as RequestContextService,
      variants as unknown as ProductVariantRepository,
      inventory as unknown as InventoryRepository,
      reservations as unknown as InventoryReservationRepository,
      movements as unknown as InventoryMovementRepository,
      transaction as unknown as TransactionService,
    );
  });

  function withTenant(): void {
    requestContext.getCurrent.mockReturnValue({
      requestId: 'req-1',
      store: { id: 'store-1', slug: 'my-store', name: 'My Store', status: 'ACTIVE' },
    });
  }

  describe('reserve', () => {
    it('reserves stock atomically and creates the ACTIVE reservation + RESERVATION movement', async () => {
      withTenant();
      variants.findById.mockResolvedValue(variantRow);
      inventory.guardedReserve.mockResolvedValue({ count: 1 });
      reservations.create.mockResolvedValue(reservationRow);
      inventory.findByVariantTx.mockResolvedValue(inventoryRow);

      const result = await service.reserve(
        'variant-1',
        5,
        { cartId: 'cart-1' },
        new Date(Date.now() + 24 * 60 * 60 * 1000),
      );

      expect(result).toMatchObject({
        id: 'res-1',
        variantId: 'variant-1',
        quantity: 5,
        status: ReservationStatus.ACTIVE,
      });
      expect(transaction.runWithTenant).toHaveBeenCalledWith('store-1', expect.any(Function));
      // The guarded increment is the ONLY availability decision (never a
      // read-then-write check).
      expect(inventory.guardedReserve).toHaveBeenCalledWith(
        expect.anything(),
        'store-1',
        'variant-1',
        5,
      );
      expect(reservations.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ storeId: 'store-1', variantId: 'variant-1', quantity: 5 }),
      );
      expect(movements.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          movementType: MovementType.RESERVATION,
          quantity: 5,
          referenceType: 'reservation',
          referenceId: 'res-1',
          onHandAfter: 10,
          reservedAfter: 5,
        }),
      );
    });

    it('rejects with INSUFFICIENT_INVENTORY when the guarded update affects zero rows and creates NO reservation', async () => {
      withTenant();
      variants.findById.mockResolvedValue(variantRow);
      inventory.guardedReserve.mockResolvedValue({ count: 0 });

      await expect(service.reserve('variant-1', 7, { orderId: 'order-1' })).rejects.toBeInstanceOf(
        InsufficientInventoryError,
      );

      expect(reservations.create).not.toHaveBeenCalled();
      expect(movements.create).not.toHaveBeenCalled();
    });

    it('fails closed for a variant outside the current store (NOT_FOUND)', async () => {
      withTenant();
      variants.findById.mockResolvedValue(null);

      await expect(service.reserve('variant-1', 1, { cartId: 'cart-1' })).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(inventory.guardedReserve).not.toHaveBeenCalled();
    });

    it('refuses to reserve stock for an archived variant (STATE_TRANSITION)', async () => {
      withTenant();
      variants.findById.mockResolvedValue({ ...variantRow, status: VariantStatus.ARCHIVED });

      await expect(service.reserve('variant-1', 1, { cartId: 'cart-1' })).rejects.toBeInstanceOf(
        StateTransitionError,
      );
    });

    it('requires a cart or order context (DB CHECK requires at least one)', async () => {
      withTenant();
      variants.findById.mockResolvedValue(variantRow);

      await expect(service.reserve('variant-1', 1, {})).rejects.toBeInstanceOf(ValidationError);
    });

    it('rejects a non-positive or non-integer quantity', async () => {
      withTenant();
      variants.findById.mockResolvedValue(variantRow);

      await expect(service.reserve('variant-1', 0, { cartId: 'cart-1' })).rejects.toBeInstanceOf(
        ValidationError,
      );
      await expect(service.reserve('variant-1', 1.5, { cartId: 'cart-1' })).rejects.toBeInstanceOf(
        ValidationError,
      );
    });

    it('rejects an expires_at in the past', async () => {
      withTenant();
      variants.findById.mockResolvedValue(variantRow);

      await expect(
        service.reserve('variant-1', 1, { cartId: 'cart-1' }, new Date('2020-01-01T00:00:00Z')),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('requires a resolved tenant context (TENANT_CONTEXT_REQUIRED)', async () => {
      requestContext.getCurrent.mockReturnValue({ requestId: 'req-1' });

      await expect(service.reserve('variant-1', 1, { cartId: 'cart-1' })).rejects.toBeInstanceOf(
        TenantContextRequiredError,
      );
    });
  });

  describe('release', () => {
    it('transitions ACTIVE -> RELEASED, releases the reserved quantity and writes a RELEASE movement', async () => {
      withTenant();
      reservations.findById.mockResolvedValue(reservationRow);
      reservations.transitionStatus.mockResolvedValue({ count: 1 });
      inventory.guardedRelease.mockResolvedValue({ count: 1 });
      inventory.findByVariantTx.mockResolvedValue({ ...inventoryRow, reservedQuantity: 0 });
      reservations.findByIdTx.mockResolvedValue({
        ...reservationRow,
        status: ReservationStatus.RELEASED,
        releasedAt: new Date('2026-08-12T12:00:00Z'),
      });

      const result = await service.release('res-1');

      expect(result.status).toBe(ReservationStatus.RELEASED);
      expect(reservations.transitionStatus).toHaveBeenCalledWith(
        expect.anything(),
        'store-1',
        'res-1',
        ReservationStatus.ACTIVE,
        ReservationStatus.RELEASED,
      );
      expect(inventory.guardedRelease).toHaveBeenCalledWith(
        expect.anything(),
        'store-1',
        'variant-1',
        5,
      );
      expect(movements.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          movementType: MovementType.RELEASE,
          quantity: -5,
          referenceId: 'res-1',
          onHandAfter: 10,
          reservedAfter: 0,
        }),
      );
    });

    it('is idempotent for an already-RELEASED reservation (no transition, no decrement, no movement)', async () => {
      withTenant();
      reservations.findById.mockResolvedValue({
        ...reservationRow,
        status: ReservationStatus.RELEASED,
        releasedAt: new Date('2026-08-12T12:00:00Z'),
      });

      const result = await service.release('res-1');

      expect(result.status).toBe(ReservationStatus.RELEASED);
      expect(transaction.runWithTenant).not.toHaveBeenCalled();
      expect(inventory.guardedRelease).not.toHaveBeenCalled();
      expect(movements.create).not.toHaveBeenCalled();
    });

    it('forbids releasing a CONSUMED reservation (STATE_TRANSITION)', async () => {
      withTenant();
      reservations.findById.mockResolvedValue({
        ...reservationRow,
        status: ReservationStatus.CONSUMED,
        consumedAt: new Date('2026-08-12T12:00:00Z'),
      });

      await expect(service.release('res-1')).rejects.toBeInstanceOf(StateTransitionError);
      expect(inventory.guardedRelease).not.toHaveBeenCalled();
    });

    it('fails closed for a reservation outside the current store (NOT_FOUND)', async () => {
      withTenant();
      reservations.findById.mockResolvedValue(null);

      await expect(service.release('other-res')).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('consume', () => {
    it('transitions ACTIVE -> CONSUMED, decrements on_hand and reserved, writes a CONSUMPTION movement', async () => {
      withTenant();
      reservations.findById.mockResolvedValue(reservationRow);
      reservations.transitionStatus.mockResolvedValue({ count: 1 });
      inventory.guardedConsume.mockResolvedValue({ count: 1 });
      inventory.findByVariantTx.mockResolvedValue({
        ...inventoryRow,
        onHandQuantity: 5,
        reservedQuantity: 0,
      });
      reservations.findByIdTx.mockResolvedValue({
        ...reservationRow,
        status: ReservationStatus.CONSUMED,
        consumedAt: new Date('2026-08-12T12:00:00Z'),
      });

      const result = await service.consume('res-1');

      expect(result.status).toBe(ReservationStatus.CONSUMED);
      expect(inventory.guardedConsume).toHaveBeenCalledWith(
        expect.anything(),
        'store-1',
        'variant-1',
        5,
      );
      expect(movements.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          movementType: MovementType.CONSUMPTION,
          quantity: -5,
          referenceId: 'res-1',
          onHandAfter: 5,
          reservedAfter: 0,
        }),
      );
    });

    it('is idempotent for an already-CONSUMED reservation (no transition, no decrement, no movement)', async () => {
      withTenant();
      reservations.findById.mockResolvedValue({
        ...reservationRow,
        status: ReservationStatus.CONSUMED,
        consumedAt: new Date('2026-08-12T12:00:00Z'),
      });

      const result = await service.consume('res-1');

      expect(result.status).toBe(ReservationStatus.CONSUMED);
      expect(transaction.runWithTenant).not.toHaveBeenCalled();
      expect(inventory.guardedConsume).not.toHaveBeenCalled();
      expect(movements.create).not.toHaveBeenCalled();
    });

    it('forbids consuming a RELEASED reservation (STATE_TRANSITION)', async () => {
      withTenant();
      reservations.findById.mockResolvedValue({
        ...reservationRow,
        status: ReservationStatus.RELEASED,
        releasedAt: new Date('2026-08-12T12:00:00Z'),
      });

      await expect(service.consume('res-1')).rejects.toBeInstanceOf(StateTransitionError);
      expect(inventory.guardedConsume).not.toHaveBeenCalled();
    });
  });

  describe('concurrency — only one operation may win', () => {
    it('when the guarded transition affects 0 rows and the reservation is already in the target state, the call is an idempotent no-op', async () => {
      withTenant();
      reservations.findById.mockResolvedValue(reservationRow); // pre-check: ACTIVE
      reservations.transitionStatus.mockResolvedValue({ count: 0 }); // concurrent op won
      reservations.findByIdTx.mockResolvedValue({
        ...reservationRow,
        status: ReservationStatus.RELEASED,
        releasedAt: new Date('2026-08-12T12:00:00Z'),
      });

      const result = await service.release('res-1');

      expect(result.status).toBe(ReservationStatus.RELEASED);
      expect(inventory.guardedRelease).not.toHaveBeenCalled();
      expect(movements.create).not.toHaveBeenCalled();
    });

    it('when the guarded transition affects 0 rows and the OTHER operation won, the loser gets STATE_TRANSITION', async () => {
      withTenant();
      reservations.findById.mockResolvedValue(reservationRow); // pre-check: ACTIVE
      reservations.transitionStatus.mockResolvedValue({ count: 0 }); // concurrent consume won
      reservations.findByIdTx.mockResolvedValue({
        ...reservationRow,
        status: ReservationStatus.CONSUMED,
        consumedAt: new Date('2026-08-12T12:00:00Z'),
      });

      await expect(service.release('res-1')).rejects.toBeInstanceOf(StateTransitionError);
      expect(inventory.guardedRelease).not.toHaveBeenCalled();
    });
  });

  describe('expireDueReservations', () => {
    const dueReservation = {
      ...reservationRow,
      id: 'res-due',
      expiresAt: new Date('2026-08-11T00:00:00Z'),
    };

    it('releases expired ACTIVE reservations (ACTIVE -> RELEASED + RELEASE movement)', async () => {
      withTenant();
      reservations.findDueForExpiration.mockResolvedValue([dueReservation]);
      reservations.transitionStatus.mockResolvedValue({ count: 1 });
      inventory.guardedRelease.mockResolvedValue({ count: 1 });
      inventory.findByVariantTx.mockResolvedValue({ ...inventoryRow, reservedQuantity: 0 });

      const result = await service.expireDueReservations();

      expect(result).toEqual({ scanned: 1, released: 1 });
      expect(reservations.transitionStatus).toHaveBeenCalledWith(
        expect.anything(),
        'store-1',
        'res-due',
        ReservationStatus.ACTIVE,
        ReservationStatus.RELEASED,
      );
      expect(movements.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          movementType: MovementType.RELEASE,
          quantity: -5,
          referenceId: 'res-due',
          onHandAfter: 10,
          reservedAfter: 0,
        }),
      );
    });

    it('skips a reservation already consumed/released by a concurrent operation (guard count 0)', async () => {
      withTenant();
      reservations.findDueForExpiration.mockResolvedValue([dueReservation]);
      reservations.transitionStatus.mockResolvedValue({ count: 0 });

      const result = await service.expireDueReservations();

      expect(result).toEqual({ scanned: 1, released: 0 });
      expect(inventory.guardedRelease).not.toHaveBeenCalled();
      expect(movements.create).not.toHaveBeenCalled();
    });

    it('is idempotent across repeated sweeps (a second run finds nothing due)', async () => {
      withTenant();
      reservations.findDueForExpiration.mockResolvedValue([]);

      await expect(service.expireDueReservations()).resolves.toEqual({ scanned: 0, released: 0 });
    });

    it('rejects an invalid batch size', async () => {
      withTenant();

      await expect(service.expireDueReservations(0)).rejects.toBeInstanceOf(ValidationError);
    });

    it('expireDueReservationsForStore runs without a tenant context (Phase 21 job path)', async () => {
      reservations.findDueForExpiration.mockResolvedValue([dueReservation]);
      reservations.transitionStatus.mockResolvedValue({ count: 1 });
      inventory.guardedRelease.mockResolvedValue({ count: 1 });
      inventory.findByVariantTx.mockResolvedValue({ ...inventoryRow, reservedQuantity: 0 });

      const result = await service.expireDueReservationsForStore('store-42', 50);

      expect(reservations.findDueForExpiration).toHaveBeenCalledWith(
        'store-42',
        expect.any(Date),
        50,
      );
      expect(result).toEqual({ scanned: 1, released: 1 });
      expect(movements.create).toHaveBeenCalledTimes(1);
    });

    it('expireDueReservationsForStore validates the batch size', async () => {
      await expect(service.expireDueReservationsForStore('store-42', 0)).rejects.toBeInstanceOf(
        ValidationError,
      );
    });
  });

  describe('consumeAllForOrderTx (payment success — Payments phase)', () => {
    const orderReservation = {
      ...reservationRow,
      id: 'res-order',
      orderId: 'order-1',
      cartId: null,
    };

    it('consumes every ACTIVE reservation: guarded ACTIVE -> CONSUMED + on_hand/reserved decrement + CONSUMPTION movement', async () => {
      reservations.findActiveByOrderTx.mockResolvedValue([orderReservation]);
      reservations.transitionStatus.mockResolvedValue({ count: 1 });
      inventory.guardedConsume.mockResolvedValue({ count: 1 });
      inventory.findByVariantTx.mockResolvedValue({
        ...inventoryRow,
        onHandQuantity: 5,
        reservedQuantity: 0,
      });

      const result = await service.consumeAllForOrderTx({} as never, 'store-1', 'order-1');

      expect(result).toEqual({ consumed: 1 });
      expect(reservations.findActiveByOrderTx).toHaveBeenCalledWith(
        expect.anything(),
        'store-1',
        'order-1',
      );
      expect(reservations.transitionStatus).toHaveBeenCalledWith(
        expect.anything(),
        'store-1',
        'res-order',
        ReservationStatus.ACTIVE,
        ReservationStatus.CONSUMED,
      );
      expect(inventory.guardedConsume).toHaveBeenCalledWith(
        expect.anything(),
        'store-1',
        'variant-1',
        5,
      );
      expect(movements.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          movementType: MovementType.CONSUMPTION,
          quantity: -5,
          referenceId: 'res-order',
          onHandAfter: 5,
          reservedAfter: 0,
        }),
      );
    });

    it('is idempotent: a reservation already consumed/released is skipped (guard count 0)', async () => {
      reservations.findActiveByOrderTx.mockResolvedValue([orderReservation]);
      reservations.transitionStatus.mockResolvedValue({ count: 0 });

      const result = await service.consumeAllForOrderTx({} as never, 'store-1', 'order-1');

      expect(result).toEqual({ consumed: 0 });
      expect(inventory.guardedConsume).not.toHaveBeenCalled();
      expect(movements.create).not.toHaveBeenCalled();
    });

    it('is a no-op when the order has no ACTIVE reservations (retried webhook)', async () => {
      reservations.findActiveByOrderTx.mockResolvedValue([]);

      const result = await service.consumeAllForOrderTx({} as never, 'store-1', 'order-1');

      expect(result).toEqual({ consumed: 0 });
      expect(reservations.transitionStatus).not.toHaveBeenCalled();
    });
  });

  describe('restockReturnedItemsTx (Phase 28 — F-1)', () => {
    it('restores on_hand per order item and writes RETURN movements', async () => {
      inventory.guardedRestock.mockResolvedValue({ count: 1 });
      inventory.findByVariantTx.mockResolvedValue(inventoryRow);

      const result = await service.restockReturnedItemsTx(
        {} as never,
        'store-1',
        [{ variantId: 'variant-1', quantity: 3 }],
        { type: 'shipment', id: 'shipment-1' },
      );

      expect(inventory.guardedRestock).toHaveBeenCalledWith(
        {},
        'store-1',
        'variant-1',
        3,
      );
      expect(movements.create).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          storeId: 'store-1',
          variantId: 'variant-1',
          movementType: MovementType.RETURN,
          quantity: 3,
          referenceType: 'shipment',
          referenceId: 'shipment-1',
          onHandAfter: inventoryRow.onHandQuantity,
          reservedAfter: inventoryRow.reservedQuantity,
        }),
      );
      expect(result).toEqual({ restocked: 1 });
    });

    it('fails closed when the inventory row is missing (guarded update count 0)', async () => {
      inventory.guardedRestock.mockResolvedValue({ count: 0 });

      await expect(
        service.restockReturnedItemsTx(
          {} as never,
          'store-1',
          [{ variantId: 'variant-1', quantity: 3 }],
          { type: 'shipment', id: 'shipment-1' },
        ),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(movements.create).not.toHaveBeenCalled();
    });

    it('skips items without a variant reference (variant deleted -> FK SetNull)', async () => {
      const result = await service.restockReturnedItemsTx(
        {} as never,
        'store-1',
        [{ variantId: null, quantity: 2 }],
        { type: 'shipment', id: 'shipment-1' },
      );

      expect(inventory.guardedRestock).not.toHaveBeenCalled();
      expect(movements.create).not.toHaveBeenCalled();
      expect(result).toEqual({ restocked: 0 });
    });
  });
});

