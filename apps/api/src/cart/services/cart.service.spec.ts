import { ConfigService } from '@nestjs/config';
import { CartStatus, Prisma, ProductStatus, VariantStatus } from '@prisma/client';
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
import { InventoryService } from '../../inventory/services/inventory.service';
import { ProductRepository } from '../../catalog/repositories/product.repository';
import { ProductVariantRepository } from '../../catalog/repositories/product-variant.repository';
import { AddCartItemDto } from '../dto/add-cart-item.dto';
import { UpdateCartItemDto } from '../dto/update-cart-item.dto';
import { CartItemRepository } from '../repositories/cart-item.repository';
import { CartRepository } from '../repositories/cart.repository';
import { CartService } from './cart.service';

describe('CartService', () => {
  let requestContext: { getCurrent: jest.Mock };
  let carts: {
    findByGuestToken: jest.Mock;
    findByGuestTokenTx: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    transitionStatus: jest.Mock;
    findDueForExpiration: jest.Mock;
  };
  let items: {
    findById: jest.Mock;
    findManyByCart: jest.Mock;
    findManyByCartTx: jest.Mock;
    findByVariantTx: jest.Mock;
    create: jest.Mock;
    updateQuantity: jest.Mock;
    delete: jest.Mock;
    deleteManyByCart: jest.Mock;
  };
  let variants: { findById: jest.Mock };
  let products: { findById: jest.Mock };
  let inventoryService: { getInventory: jest.Mock };
  let transaction: { runWithTenant: jest.Mock };
  let service: CartService;
  const tx = { id: 'tx' };

  const variantRow = {
    id: 'variant-1',
    storeId: 'store-1',
    productId: 'product-1',
    name: 'Classic T-Shirt',
    sku: null,
    price: 500n,
    compareAtPrice: null,
    costPrice: null,
    status: VariantStatus.ACTIVE,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const productRow = {
    id: 'product-1',
    storeId: 'store-1',
    name: 'Classic T-Shirt',
    slug: 'classic-t-shirt',
    description: null,
    status: ProductStatus.ACTIVE,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const cartRow = {
    id: 'cart-1',
    storeId: 'store-1',
    customerId: null,
    guestToken: 'guest-token-1',
    status: CartStatus.ACTIVE,
    currency: 'EGP',
    expiresAt: null,
    completedAt: null,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const itemRow = {
    id: 'item-1',
    cartId: 'cart-1',
    variantId: 'variant-1',
    quantity: 2,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const itemWithVariant = { ...itemRow, variant: { ...variantRow, product: productRow } };

  const inventoryView = { variantId: 'variant-1', onHand: 10, reserved: 2, available: 8 };
  beforeEach(() => {
    requestContext = { getCurrent: jest.fn() };
    carts = {
      findByGuestToken: jest.fn(),
      findByGuestTokenTx: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      transitionStatus: jest.fn(),
      findDueForExpiration: jest.fn(),
    };
    items = {
      findById: jest.fn(),
      findManyByCart: jest.fn(),
      findManyByCartTx: jest.fn(),
      findByVariantTx: jest.fn(),
      create: jest.fn(),
      updateQuantity: jest.fn(),
      delete: jest.fn(),
      deleteManyByCart: jest.fn(),
    };
    variants = { findById: jest.fn() };
    products = { findById: jest.fn() };
    inventoryService = { getInventory: jest.fn() };
    transaction = {
      runWithTenant: jest
        .fn()
        .mockImplementation(async (_storeId: string, work: (t: unknown) => Promise<unknown>) =>
          work(tx),
        ),
    };

    service = new CartService(
      requestContext as unknown as RequestContextService,
      carts as unknown as CartRepository,
      items as unknown as CartItemRepository,
      variants as unknown as ProductVariantRepository,
      products as unknown as ProductRepository,
      inventoryService as unknown as InventoryService,
      transaction as unknown as TransactionService,
      { get: jest.fn().mockReturnValue(7 * 24 * 60 * 60 * 1000) } as unknown as ConfigService,
    );
  });

  function withTenant(): void {
    requestContext.getCurrent.mockReturnValue({
      requestId: 'req-1',
      store: { id: 'store-1', slug: 'my-store', name: 'My Store', status: 'ACTIVE' },
    });
  }

  function addDto(overrides: Partial<AddCartItemDto> = {}): AddCartItemDto {
    return { variantId: 'variant-1', quantity: 2, ...overrides };
  }

  function updateDto(quantity = 3): UpdateCartItemDto {
    return { quantity };
  }

  /** Defaults that let addItem succeed end-to-end against a fresh guest cart. */
  function stubPurchasableFlow(): void {
    variants.findById.mockResolvedValue(variantRow);
    products.findById.mockResolvedValue(productRow);
    inventoryService.getInventory.mockResolvedValue(inventoryView);
    carts.findById.mockResolvedValue(cartRow);
    items.findManyByCart.mockResolvedValue([itemWithVariant]);
    items.create.mockResolvedValue(itemRow);
    carts.create.mockResolvedValue(cartRow);
  }
  describe('getCart', () => {
    it('fails with TENANT_CONTEXT_REQUIRED without a resolved tenant', async () => {
      await expect(service.getCart('guest-token-1')).rejects.toBeInstanceOf(
        TenantContextRequiredError,
      );
      expect(carts.findByGuestToken).not.toHaveBeenCalled();
    });

    it('returns NOT_FOUND when no guest token is supplied', async () => {
      withTenant();
      await expect(service.getCart(undefined)).rejects.toBeInstanceOf(NotFoundError);
      expect(carts.findByGuestToken).not.toHaveBeenCalled();
    });

    it('returns NOT_FOUND for an unknown token (no existence leak)', async () => {
      withTenant();
      carts.findByGuestToken.mockResolvedValue(null);

      await expect(service.getCart('unknown-token')).rejects.toBeInstanceOf(NotFoundError);
      expect(carts.findByGuestToken).toHaveBeenCalledWith('store-1', 'unknown-token');
    });

    it('returns the store-scoped cart view with current variant prices', async () => {
      withTenant();
      carts.findByGuestToken.mockResolvedValue(cartRow);
      carts.findById.mockResolvedValue(cartRow);
      items.findManyByCart.mockResolvedValue([itemWithVariant]);

      const view = await service.getCart('guest-token-1');

      expect(carts.findByGuestToken).toHaveBeenCalledWith('store-1', 'guest-token-1');
      expect(carts.findById).toHaveBeenCalledWith('store-1', 'cart-1');
      expect(items.findManyByCart).toHaveBeenCalledWith('cart-1');
      expect(view).toEqual({
        id: 'cart-1',
        status: 'ACTIVE',
        currency: 'EGP',
        guestToken: 'guest-token-1',
        expiresAt: null,
        items: [
          {
            id: 'item-1',
            variantId: 'variant-1',
            productId: 'product-1',
            name: 'Classic T-Shirt',
            sku: null,
            variantStatus: 'ACTIVE',
            quantity: 2,
            unitPrice: 500,
            compareAtPrice: null,
          },
        ],
        createdAt: '2026-08-12T00:00:00.000Z',
        updatedAt: '2026-08-12T00:00:00.000Z',
      });
    });

    it('lazily expires a cart whose expires_at has passed (guarded transition)', async () => {
      withTenant();
      const expiredDue = { ...cartRow, expiresAt: new Date('2026-08-01T00:00:00Z') };
      carts.findByGuestToken.mockResolvedValue(expiredDue);
      carts.transitionStatus.mockResolvedValue({ count: 1 });
      carts.findById.mockResolvedValue({ ...expiredDue, status: CartStatus.EXPIRED });
      items.findManyByCart.mockResolvedValue([]);

      const view = await service.getCart('guest-token-1');

      expect(carts.transitionStatus).toHaveBeenCalledWith(
        tx,
        'store-1',
        'cart-1',
        CartStatus.ACTIVE,
        CartStatus.EXPIRED,
      );
      expect(view.status).toBe('EXPIRED');
    });

    it('does not expire a cart with a future expiry', async () => {
      withTenant();
      carts.findByGuestToken.mockResolvedValue({
        ...cartRow,
        expiresAt: new Date('2026-08-20T00:00:00Z'),
      });
      carts.findById.mockResolvedValue(cartRow);
      items.findManyByCart.mockResolvedValue([]);

      await service.getCart('guest-token-1');

      expect(carts.transitionStatus).not.toHaveBeenCalled();
    });
  });
  describe('addItem', () => {
    it('fails with TENANT_CONTEXT_REQUIRED without a resolved tenant', async () => {
      await expect(service.addItem(undefined, addDto())).rejects.toBeInstanceOf(
        TenantContextRequiredError,
      );
    });

    it('returns NOT_FOUND for a variant outside the current store', async () => {
      withTenant();
      variants.findById.mockResolvedValue(null);

      await expect(service.addItem(undefined, addDto())).rejects.toBeInstanceOf(NotFoundError);
      expect(carts.create).not.toHaveBeenCalled();
    });

    it('rejects an ARCHIVED variant with CONFLICT (not purchasable)', async () => {
      withTenant();
      variants.findById.mockResolvedValue({ ...variantRow, status: VariantStatus.ARCHIVED });
      products.findById.mockResolvedValue(productRow);

      await expect(service.addItem(undefined, addDto())).rejects.toBeInstanceOf(ConflictError);
      expect(carts.create).not.toHaveBeenCalled();
    });

    it('rejects a variant whose product is not ACTIVE with CONFLICT', async () => {
      withTenant();
      variants.findById.mockResolvedValue(variantRow);
      products.findById.mockResolvedValue({ ...productRow, status: ProductStatus.DRAFT });

      await expect(service.addItem(undefined, addDto())).rejects.toBeInstanceOf(ConflictError);
      expect(carts.create).not.toHaveBeenCalled();
    });

    it('creates a guest cart on first use and adds the item', async () => {
      withTenant();
      stubPurchasableFlow();

      const view = await service.addItem(undefined, addDto({ quantity: 2 }));

      expect(carts.create).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          storeId: 'store-1',
          guestToken: expect.any(String),
        }),
      );
      expect(items.create).toHaveBeenCalledWith(tx, {
        cartId: 'cart-1',
        variantId: 'variant-1',
        quantity: 2,
      });
      expect(transaction.runWithTenant).toHaveBeenCalledWith('store-1', expect.any(Function));
      expect(view.items[0]).toMatchObject({ variantId: 'variant-1', quantity: 2, unitPrice: 500 });
    });

    it('adds to the cart selected by the guest token (token is a lookup key only)', async () => {
      withTenant();
      stubPurchasableFlow();
      carts.findByGuestTokenTx.mockResolvedValue(cartRow);
      items.findByVariantTx.mockResolvedValue(null);

      await service.addItem('guest-token-1', addDto());

      expect(carts.findByGuestTokenTx).toHaveBeenCalledWith(tx, 'store-1', 'guest-token-1');
      expect(carts.create).not.toHaveBeenCalled();
      expect(items.create).toHaveBeenCalledWith(tx, {
        cartId: 'cart-1',
        variantId: 'variant-1',
        quantity: 2,
      });
    });
    it('returns NOT_FOUND for a token with no matching cart in the store', async () => {
      withTenant();
      stubPurchasableFlow();
      carts.findByGuestTokenTx.mockResolvedValue(null);

      await expect(service.addItem('unknown-token', addDto())).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(items.create).not.toHaveBeenCalled();
    });

    it('merges quantity when the variant already has a line (UNIQUE cart_id, variant_id)', async () => {
      withTenant();
      stubPurchasableFlow();
      carts.findByGuestTokenTx.mockResolvedValue(cartRow);
      items.findByVariantTx.mockResolvedValue({ ...itemRow, quantity: 2 });
      items.updateQuantity.mockResolvedValue({ count: 1 });

      await service.addItem('guest-token-1', addDto({ quantity: 3 }));

      expect(items.findByVariantTx).toHaveBeenCalledWith(tx, 'cart-1', 'variant-1');
      expect(items.updateQuantity).toHaveBeenCalledWith(tx, 'cart-1', 'item-1', 5);
      expect(items.create).not.toHaveBeenCalled();
    });

    it('rejects when availability is insufficient for the merged quantity', async () => {
      withTenant();
      stubPurchasableFlow();
      carts.findByGuestTokenTx.mockResolvedValue(cartRow);
      items.findByVariantTx.mockResolvedValue({ ...itemRow, quantity: 7 });
      inventoryService.getInventory.mockResolvedValue({ ...inventoryView, available: 8 });

      await expect(
        service.addItem('guest-token-1', addDto({ quantity: 2 })),
      ).rejects.toBeInstanceOf(InsufficientInventoryError);
      expect(items.updateQuantity).not.toHaveBeenCalled();
      expect(items.create).not.toHaveBeenCalled();
    });

    it('rejects when availability is insufficient', async () => {
      withTenant();
      stubPurchasableFlow();
      inventoryService.getInventory.mockResolvedValue({ ...inventoryView, available: 1 });

      await expect(service.addItem(undefined, addDto({ quantity: 2 }))).rejects.toBeInstanceOf(
        InsufficientInventoryError,
      );
    });

    it('fails closed with INSUFFICIENT_INVENTORY when no inventory row exists', async () => {
      withTenant();
      stubPurchasableFlow();
      inventoryService.getInventory.mockRejectedValue(
        new NotFoundError('No inventory has been set for this variant.'),
      );

      await expect(service.addItem(undefined, addDto())).rejects.toBeInstanceOf(
        InsufficientInventoryError,
      );
      expect(items.create).not.toHaveBeenCalled();
    });

    it('rejects mutating an EXPIRED cart with STATE_TRANSITION (lazy expiry first)', async () => {
      withTenant();
      stubPurchasableFlow();
      carts.findByGuestTokenTx.mockResolvedValue({
        ...cartRow,
        expiresAt: new Date('2026-08-01T00:00:00Z'),
      });
      carts.transitionStatus.mockResolvedValue({ count: 1 });

      await expect(service.addItem('guest-token-1', addDto())).rejects.toBeInstanceOf(
        StateTransitionError,
      );
      expect(carts.transitionStatus).toHaveBeenCalledWith(
        tx,
        'store-1',
        'cart-1',
        CartStatus.ACTIVE,
        CartStatus.EXPIRED,
      );
      expect(items.create).not.toHaveBeenCalled();
    });

    it('maps a concurrent P2002 unique-violation race to CONFLICT', async () => {
      withTenant();
      stubPurchasableFlow();
      transaction.runWithTenant.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('race', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(service.addItem(undefined, addDto())).rejects.toBeInstanceOf(ConflictError);
    });
  });
  describe('updateItem', () => {
    it('returns NOT_FOUND without a session cart token', async () => {
      withTenant();
      await expect(service.updateItem(undefined, 'item-1', updateDto())).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('returns NOT_FOUND for an item that does not belong to the cart', async () => {
      withTenant();
      carts.findByGuestToken.mockResolvedValue(cartRow);
      items.findById.mockResolvedValue(null);

      await expect(
        service.updateItem('guest-token-1', 'foreign-item', updateDto()),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(items.findById).toHaveBeenCalledWith('cart-1', 'foreign-item');
    });

    it('revalidates the variant and updates the quantity', async () => {
      withTenant();
      carts.findByGuestToken.mockResolvedValue(cartRow);
      items.findById.mockResolvedValue(itemRow);
      variants.findById.mockResolvedValue(variantRow);
      products.findById.mockResolvedValue(productRow);
      inventoryService.getInventory.mockResolvedValue(inventoryView);
      items.updateQuantity.mockResolvedValue({ count: 1 });
      carts.findById.mockResolvedValue(cartRow);
      items.findManyByCart.mockResolvedValue([{ ...itemWithVariant, quantity: 3 }]);

      const view = await service.updateItem('guest-token-1', 'item-1', updateDto(3));

      expect(variants.findById).toHaveBeenCalledWith('store-1', 'variant-1');
      expect(items.updateQuantity).toHaveBeenCalledWith(tx, 'cart-1', 'item-1', 3);
      expect(view.items[0]).toMatchObject({ quantity: 3 });
    });

    it('rejects an update when the variant is no longer purchasable (CONFLICT)', async () => {
      withTenant();
      carts.findByGuestToken.mockResolvedValue(cartRow);
      items.findById.mockResolvedValue(itemRow);
      variants.findById.mockResolvedValue({ ...variantRow, status: VariantStatus.ARCHIVED });
      products.findById.mockResolvedValue(productRow);

      await expect(
        service.updateItem('guest-token-1', 'item-1', updateDto()),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(items.updateQuantity).not.toHaveBeenCalled();
    });

    it('rejects when availability is insufficient for the new quantity', async () => {
      withTenant();
      carts.findByGuestToken.mockResolvedValue(cartRow);
      items.findById.mockResolvedValue(itemRow);
      variants.findById.mockResolvedValue(variantRow);
      products.findById.mockResolvedValue(productRow);
      inventoryService.getInventory.mockResolvedValue({ ...inventoryView, available: 1 });

      await expect(
        service.updateItem('guest-token-1', 'item-1', updateDto(3)),
      ).rejects.toBeInstanceOf(InsufficientInventoryError);
      expect(items.updateQuantity).not.toHaveBeenCalled();
    });

    it('returns NOT_FOUND when the guarded quantity update affected no rows', async () => {
      withTenant();
      carts.findByGuestToken.mockResolvedValue(cartRow);
      items.findById.mockResolvedValue(itemRow);
      variants.findById.mockResolvedValue(variantRow);
      products.findById.mockResolvedValue(productRow);
      inventoryService.getInventory.mockResolvedValue(inventoryView);
      items.updateQuantity.mockResolvedValue({ count: 0 });

      await expect(
        service.updateItem('guest-token-1', 'item-1', updateDto()),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('rejects mutating an EXPIRED cart with STATE_TRANSITION', async () => {
      withTenant();
      carts.findByGuestToken.mockResolvedValue({
        ...cartRow,
        status: CartStatus.EXPIRED,
        expiresAt: new Date('2026-08-01T00:00:00Z'),
      });

      await expect(
        service.updateItem('guest-token-1', 'item-1', updateDto()),
      ).rejects.toBeInstanceOf(StateTransitionError);
      expect(items.updateQuantity).not.toHaveBeenCalled();
    });
  });
  describe('removeItem', () => {
    it('removes an item that belongs to the session cart', async () => {
      withTenant();
      carts.findByGuestToken.mockResolvedValue(cartRow);
      items.delete.mockResolvedValue({ count: 1 });

      await service.removeItem('guest-token-1', 'item-1');

      expect(items.delete).toHaveBeenCalledWith(tx, 'cart-1', 'item-1');
    });

    it('returns NOT_FOUND when the item does not exist in the cart', async () => {
      withTenant();
      carts.findByGuestToken.mockResolvedValue(cartRow);
      items.delete.mockResolvedValue({ count: 0 });

      await expect(service.removeItem('guest-token-1', 'item-1')).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('returns NOT_FOUND for a foreign token', async () => {
      withTenant();
      carts.findByGuestToken.mockResolvedValue(null);

      await expect(service.removeItem('foreign-token', 'item-1')).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(items.delete).not.toHaveBeenCalled();
    });
  });

  describe('clearCart', () => {
    it('removes every item of the session cart', async () => {
      withTenant();
      carts.findByGuestToken.mockResolvedValue(cartRow);
      items.deleteManyByCart.mockResolvedValue({ count: 2 });

      await service.clearCart('guest-token-1');

      expect(items.deleteManyByCart).toHaveBeenCalledWith(tx, 'cart-1');
    });

    it('is a no-op (no error) when the cart is already empty', async () => {
      withTenant();
      carts.findByGuestToken.mockResolvedValue(cartRow);
      items.deleteManyByCart.mockResolvedValue({ count: 0 });

      await expect(service.clearCart('guest-token-1')).resolves.toBeUndefined();
    });

    it('rejects clearing an EXPIRED cart with STATE_TRANSITION', async () => {
      withTenant();
      carts.findByGuestToken.mockResolvedValue({
        ...cartRow,
        status: CartStatus.EXPIRED,
        expiresAt: new Date('2026-08-01T00:00:00Z'),
      });

      await expect(service.clearCart('guest-token-1')).rejects.toBeInstanceOf(StateTransitionError);
      expect(items.deleteManyByCart).not.toHaveBeenCalled();
    });
  });

  describe('expireDueCarts (sweep)', () => {
    it('validates the batch size', async () => {
      withTenant();
      await expect(service.expireDueCarts(0)).rejects.toBeInstanceOf(ValidationError);
      await expect(service.expireDueCarts(1.5)).rejects.toBeInstanceOf(ValidationError);
      expect(carts.findDueForExpiration).not.toHaveBeenCalled();
    });

    it('transitions each due ACTIVE cart to EXPIRED inside its own tenant transaction', async () => {
      withTenant();
      const due = [
        { ...cartRow, id: 'cart-1' },
        { ...cartRow, id: 'cart-2' },
      ];
      carts.findDueForExpiration.mockResolvedValue(due);
      carts.transitionStatus.mockResolvedValue({ count: 1 });

      const result = await service.expireDueCarts(10);

      expect(carts.findDueForExpiration).toHaveBeenCalledWith('store-1', expect.any(Date), 10);
      expect(carts.transitionStatus).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ scanned: 2, expired: 2 });
    });

    it('does not count carts already transitioned by a concurrent operation', async () => {
      withTenant();
      carts.findDueForExpiration.mockResolvedValue([{ ...cartRow, id: 'cart-1' }]);
      carts.transitionStatus.mockResolvedValue({ count: 0 });

      const result = await service.expireDueCarts(100);

      expect(result).toEqual({ scanned: 1, expired: 0 });
    });

    it('expireDueCartsForStore runs without a tenant context (Phase 21 job path)', async () => {
      carts.findDueForExpiration.mockResolvedValue([{ ...cartRow, id: 'cart-1' }]);
      carts.transitionStatus.mockResolvedValue({ count: 1 });

      const result = await service.expireDueCartsForStore('store-42', 50);

      expect(carts.findDueForExpiration).toHaveBeenCalledWith('store-42', expect.any(Date), 50);
      expect(carts.transitionStatus).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ scanned: 1, expired: 1 });
    });

    it('expireDueCartsForStore validates the batch size', async () => {
      await expect(service.expireDueCartsForStore('store-42', 0)).rejects.toBeInstanceOf(
        ValidationError,
      );
    });
  });
});
