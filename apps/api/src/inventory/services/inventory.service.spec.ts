import { MovementType, Prisma, VariantStatus } from '@prisma/client';
import { RequestContextService } from '../../common/context/request-context.service';
import {
  InsufficientInventoryError,
  NotFoundError,
  TenantContextRequiredError,
  ValidationError,
} from '../../common/errors/domain-exceptions';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { ProductVariantRepository } from '../../catalog/repositories/product-variant.repository';
import { AdjustInventoryDto } from '../dto/adjust-inventory.dto';
import { ListMovementsQueryDto } from '../dto/list-movements-query.dto';
import { InventoryMovementRepository } from '../repositories/inventory-movement.repository';
import { InventoryRepository } from '../repositories/inventory.repository';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  let requestContext: { getCurrent: jest.Mock };
  let variants: { findById: jest.Mock };
  let inventory: {
    findByVariant: jest.Mock;
    findByVariantTx: jest.Mock;
    create: jest.Mock;
    guardedAdjust: jest.Mock;
    guardedReserve: jest.Mock;
    guardedConsume: jest.Mock;
    guardedRelease: jest.Mock;
  };
  let movements: { create: jest.Mock; findByVariant: jest.Mock; countByVariant: jest.Mock };
  let transaction: { run: jest.Mock; runWithTenant: jest.Mock };
  let service: InventoryService;

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
    reservedQuantity: 3,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const movementRow = {
    id: 'mov-1',
    storeId: 'store-1',
    variantId: 'variant-1',
    movementType: MovementType.ADJUSTMENT,
    quantity: 5,
    referenceType: 'adjustment',
    referenceId: null,
    reason: 'Restock',
    onHandAfter: 15,
    reservedAfter: 3,
    createdAt: new Date('2026-08-12T00:00:00Z'),
  };

  beforeEach(() => {
    requestContext = { getCurrent: jest.fn() };
    variants = { findById: jest.fn() };
    inventory = {
      findByVariant: jest.fn(),
      findByVariantTx: jest.fn(),
      create: jest.fn(),
      guardedAdjust: jest.fn(),
      guardedReserve: jest.fn(),
      guardedConsume: jest.fn(),
      guardedRelease: jest.fn(),
    };
    movements = { create: jest.fn(), findByVariant: jest.fn(), countByVariant: jest.fn() };
    transaction = { run: jest.fn(), runWithTenant: jest.fn() };

    transaction.runWithTenant.mockImplementation(
      async (_storeId: string, work: (tx: unknown) => Promise<unknown>) => work({}),
    );

    service = new InventoryService(
      requestContext as unknown as RequestContextService,
      variants as unknown as ProductVariantRepository,
      inventory as unknown as InventoryRepository,
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

  function adjustDto(overrides: Partial<AdjustInventoryDto> = {}): AdjustInventoryDto {
    return { quantity: 10, reason: 'INITIAL_STOCK', ...overrides };
  }

  describe('getInventory', () => {
    it('returns the derived inventory view (available = on_hand - reserved)', async () => {
      withTenant();
      variants.findById.mockResolvedValue(variantRow);
      inventory.findByVariant.mockResolvedValue(inventoryRow);

      const result = await service.getInventory('variant-1');

      expect(result).toEqual({ variantId: 'variant-1', onHand: 10, reserved: 3, available: 7 });
      expect(inventory.findByVariant).toHaveBeenCalledWith('store-1', 'variant-1');
    });

    it('fails closed when the variant is outside the current store (NOT_FOUND)', async () => {
      withTenant();
      variants.findById.mockResolvedValue(null);

      await expect(service.getInventory('other-variant')).rejects.toBeInstanceOf(NotFoundError);
      expect(inventory.findByVariant).not.toHaveBeenCalled();
    });

    it('returns NOT_FOUND when the inventory row was never initialized (no implicit zero)', async () => {
      withTenant();
      variants.findById.mockResolvedValue(variantRow);
      inventory.findByVariant.mockResolvedValue(null);

      await expect(service.getInventory('variant-1')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('requires a resolved tenant context (TENANT_CONTEXT_REQUIRED)', async () => {
      requestContext.getCurrent.mockReturnValue({ requestId: 'req-1' });

      await expect(service.getInventory('variant-1')).rejects.toBeInstanceOf(
        TenantContextRequiredError,
      );
    });
  });

  describe('adjust', () => {
    it('creates the inventory row on the first adjustment (INITIAL_STOCK) with an atomic movement snapshot', async () => {
      withTenant();
      variants.findById.mockResolvedValue(variantRow);
      inventory.findByVariantTx.mockResolvedValueOnce(null).mockResolvedValueOnce(inventoryRow);
      inventory.create.mockResolvedValue({
        ...inventoryRow,
        onHandQuantity: 10,
        reservedQuantity: 0,
      });

      const result = await service.adjust('variant-1', adjustDto({ quantity: 10 }));

      expect(result).toEqual({ variantId: 'variant-1', onHand: 10, reserved: 3, available: 7 });
      expect(transaction.runWithTenant).toHaveBeenCalledWith('store-1', expect.any(Function));
      expect(inventory.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ storeId: 'store-1', variantId: 'variant-1', onHandQuantity: 10 }),
      );
      // The movement snapshot must represent the post-change inventory state.
      expect(movements.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          storeId: 'store-1',
          variantId: 'variant-1',
          movementType: MovementType.INITIAL_STOCK,
          quantity: 10,
          reason: 'INITIAL_STOCK',
          onHandAfter: 10,
          reservedAfter: 3,
        }),
      );
    });

    it('applies a guarded adjustment on an existing row (ADJUSTMENT movement)', async () => {
      withTenant();
      variants.findById.mockResolvedValue(variantRow);
      inventory.findByVariantTx
        .mockResolvedValueOnce(inventoryRow) // existing
        .mockResolvedValueOnce({ ...inventoryRow, onHandQuantity: 15, reservedQuantity: 3 });
      inventory.guardedAdjust.mockResolvedValue({ count: 1 });

      const result = await service.adjust(
        'variant-1',
        adjustDto({ quantity: 5, reason: 'Restock' }),
      );

      expect(result).toEqual({ variantId: 'variant-1', onHand: 15, reserved: 3, available: 12 });
      expect(inventory.guardedAdjust).toHaveBeenCalledWith(
        expect.anything(),
        'store-1',
        'variant-1',
        5,
      );
      expect(movements.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          movementType: MovementType.ADJUSTMENT,
          quantity: 5,
          reason: 'Restock',
          onHandAfter: 15,
          reservedAfter: 3,
        }),
      );
    });

    it('rejects an adjustment that would break the invariant (guarded update affected 0 rows)', async () => {
      withTenant();
      variants.findById.mockResolvedValue(variantRow);
      inventory.findByVariantTx.mockResolvedValueOnce(inventoryRow); // existing (reserved=3, on_hand=10)
      inventory.guardedAdjust.mockResolvedValue({ count: 0 });

      await expect(service.adjust('variant-1', adjustDto({ quantity: -8 }))).rejects.toBeInstanceOf(
        InsufficientInventoryError,
      );
      expect(movements.create).not.toHaveBeenCalled();
    });

    it('rejects a negative initial stock (first adjustment)', async () => {
      withTenant();
      variants.findById.mockResolvedValue(variantRow);
      inventory.findByVariantTx.mockResolvedValueOnce(null);

      await expect(service.adjust('variant-1', adjustDto({ quantity: -5 }))).rejects.toBeInstanceOf(
        InsufficientInventoryError,
      );
      expect(inventory.create).not.toHaveBeenCalled();
    });

    it('rejects a zero quantity (no-op must not create a movement)', async () => {
      withTenant();

      await expect(service.adjust('variant-1', adjustDto({ quantity: 0 }))).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(transaction.runWithTenant).not.toHaveBeenCalled();
    });

    it('resolves the variant inside the trusted store (variant ownership)', async () => {
      withTenant();
      variants.findById.mockResolvedValue(null);

      await expect(service.adjust('variant-1', adjustDto())).rejects.toBeInstanceOf(NotFoundError);
      expect(transaction.runWithTenant).not.toHaveBeenCalled();
    });

    it('retries once when a concurrent first adjustment wins the creation race (P2002)', async () => {
      withTenant();
      variants.findById.mockResolvedValue(variantRow);
      const uniqueViolation = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.3',
        meta: { target: ['variant_id'] },
      });
      // First transaction: row missing -> create -> P2002 (aborted). Second
      // transaction: row now exists -> guarded update succeeds.
      inventory.findByVariantTx
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(inventoryRow)
        .mockResolvedValueOnce({ ...inventoryRow, onHandQuantity: 15 });
      inventory.create.mockRejectedValueOnce(uniqueViolation);
      inventory.guardedAdjust.mockResolvedValue({ count: 1 });

      const result = await service.adjust('variant-1', adjustDto({ quantity: 5 }));

      expect(result.onHand).toBe(15);
      expect(transaction.runWithTenant).toHaveBeenCalledTimes(2);
      expect(inventory.guardedAdjust).toHaveBeenCalledWith(
        expect.anything(),
        'store-1',
        'variant-1',
        5,
      );
    });
  });

  describe('listMovements', () => {
    it('returns paginated movements with the data/meta envelope data', async () => {
      withTenant();
      variants.findById.mockResolvedValue(variantRow);
      movements.findByVariant.mockResolvedValue([movementRow]);
      movements.countByVariant.mockResolvedValue(1);

      const result = await service.listMovements('variant-1', new ListMovementsQueryDto());

      expect(result.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        movementType: MovementType.ADJUSTMENT,
        onHandAfter: 15,
        reservedAfter: 3,
      });
      expect(movements.findByVariant).toHaveBeenCalledWith('store-1', 'variant-1', 0, 20);
    });

    it('fails closed for a variant outside the current store', async () => {
      withTenant();
      variants.findById.mockResolvedValue(null);

      await expect(
        service.listMovements('variant-1', new ListMovementsQueryDto()),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(movements.findByVariant).not.toHaveBeenCalled();
    });
  });
});
