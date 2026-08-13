import { Prisma, ProductStatus, VariantStatus } from '@prisma/client';
import { RequestContextService } from '../../common/context/request-context.service';
import {
  ConflictError,
  NotFoundError,
  StateTransitionError,
  TenantContextRequiredError,
} from '../../common/errors/domain-exceptions';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { CreateVariantDto } from '../dto/create-variant.dto';
import { UpdateVariantDto } from '../dto/update-variant.dto';
import { ProductRepository } from '../repositories/product.repository';
import { ProductVariantRepository } from '../repositories/product-variant.repository';
import { VariantsService } from './variants.service';

describe('VariantsService', () => {
  let requestContext: { getCurrent: jest.Mock };
  let products: { findById: jest.Mock };
  let variants: {
    create: jest.Mock;
    update: jest.Mock;
    updateStatus: jest.Mock;
    findById: jest.Mock;
    findByProductId: jest.Mock;
    countByProductId: jest.Mock;
  };
  let transaction: { run: jest.Mock; runWithTenant: jest.Mock };
  let service: VariantsService;

  const productRow = {
    id: 'product-1',
    storeId: 'store-1',
    name: 'Classic T-Shirt',
    slug: 'classic-t-shirt',
    description: null,
    status: ProductStatus.DRAFT,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const variantRow = {
    id: 'variant-1',
    storeId: 'store-1',
    productId: 'product-1',
    name: 'Black / Medium',
    sku: 'TS-BLK-M',
    price: 500n,
    compareAtPrice: 600n,
    costPrice: null,
    status: VariantStatus.ACTIVE,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  beforeEach(() => {
    requestContext = { getCurrent: jest.fn() };
    products = { findById: jest.fn() };
    variants = {
      create: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
      findById: jest.fn(),
      findByProductId: jest.fn(),
      countByProductId: jest.fn(),
    };
    transaction = { run: jest.fn(), runWithTenant: jest.fn() };

    transaction.runWithTenant.mockImplementation(
      async (_storeId: string, work: (tx: unknown) => Promise<unknown>) => work({}),
    );

    service = new VariantsService(
      requestContext as unknown as RequestContextService,
      products as unknown as ProductRepository,
      variants as unknown as ProductVariantRepository,
      transaction as unknown as TransactionService,
    );
  });

  function withTenant(): void {
    requestContext.getCurrent.mockReturnValue({
      requestId: 'req-1',
      store: { id: 'store-1', slug: 'my-store', name: 'My Store', status: 'ACTIVE' },
    });
  }

  function createDto(overrides: Partial<CreateVariantDto> = {}): CreateVariantDto {
    return {
      name: 'Black / Medium',
      sku: 'TS-BLK-M',
      price: 500,
      compareAtPrice: 600,
      ...overrides,
    };
  }

  function updateDto(overrides: Partial<UpdateVariantDto> = {}): UpdateVariantDto {
    return { price: 550, ...overrides };
  }

  describe('create', () => {
    it('creates a variant for a product in the current store with BIGINT minor-unit prices', async () => {
      withTenant();
      products.findById.mockResolvedValue(productRow);
      variants.create.mockResolvedValue(variantRow);

      const result = await service.create('product-1', createDto());

      expect(products.findById).toHaveBeenCalledWith('store-1', 'product-1');
      expect(variants.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          storeId: 'store-1',
          productId: 'product-1',
          name: 'Black / Medium',
          sku: 'TS-BLK-M',
          price: 500n,
          compareAtPrice: 600n,
          status: VariantStatus.ACTIVE,
        }),
      );
      expect(result).toMatchObject({ id: 'variant-1', price: 500, compareAtPrice: 600 });
    });

    it('rejects creating a variant for a product outside the current store', async () => {
      withTenant();
      products.findById.mockResolvedValue(null);

      await expect(service.create('product-999', createDto())).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(variants.create).not.toHaveBeenCalled();
    });

    it('normalizes an empty SKU to NULL (store-scoped UNIQUE allows many NULLs)', async () => {
      withTenant();
      products.findById.mockResolvedValue(productRow);
      variants.create.mockResolvedValue({ ...variantRow, sku: null });

      await service.create('product-1', createDto({ sku: '   ' }));

      expect(variants.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ sku: null }),
      );
    });

    it('maps a store-scoped duplicate SKU (P2002) to CONFLICT', async () => {
      withTenant();
      products.findById.mockResolvedValue(productRow);
      variants.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { target: ['store_id', 'sku'] },
        }),
      );

      await expect(service.create('product-1', createDto())).rejects.toBeInstanceOf(ConflictError);
    });

    it('fails with TENANT_CONTEXT_REQUIRED when no tenant context is present', async () => {
      requestContext.getCurrent.mockReturnValue({ requestId: 'req-1' });

      await expect(service.create('product-1', createDto())).rejects.toBeInstanceOf(
        TenantContextRequiredError,
      );
      expect(variants.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates allowed fields and converts prices to BIGINT minor units', async () => {
      withTenant();
      variants.update.mockResolvedValue({ ...variantRow, price: 550n });

      const result = await service.update('variant-1', updateDto());

      expect(variants.update).toHaveBeenCalledWith(expect.anything(), 'store-1', 'variant-1', {
        price: 550n,
      });
      expect(result.price).toBe(550);
    });

    it('clears the compare-at price when null is sent', async () => {
      withTenant();
      variants.update.mockResolvedValue({ ...variantRow, compareAtPrice: null });

      await service.update('variant-1', { compareAtPrice: null });

      expect(variants.update).toHaveBeenCalledWith(expect.anything(), 'store-1', 'variant-1', {
        compareAtPrice: null,
      });
    });

    it('maps a missing-row update (P2025) to NOT_FOUND', async () => {
      withTenant();
      variants.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: '6.19.3',
        }),
      );

      await expect(service.update('variant-999', updateDto())).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe('archive', () => {
    it('archives an ACTIVE variant with a guarded conditional UPDATE', async () => {
      withTenant();
      let updated = false;
      variants.updateStatus.mockImplementation(async () => {
        updated = true;
        return { count: 1 };
      });
      variants.findById.mockImplementation(() =>
        Promise.resolve({
          ...variantRow,
          status: updated ? VariantStatus.ARCHIVED : VariantStatus.ACTIVE,
        }),
      );

      const result = await service.archive('variant-1');

      expect(variants.updateStatus).toHaveBeenCalledWith(
        expect.anything(),
        'store-1',
        'variant-1',
        VariantStatus.ACTIVE,
        VariantStatus.ARCHIVED,
      );
      expect(result.status).toBe(VariantStatus.ARCHIVED);
    });

    it('rejects archiving an already-archived variant (terminal state)', async () => {
      withTenant();
      variants.findById.mockResolvedValue({ ...variantRow, status: VariantStatus.ARCHIVED });

      await expect(service.archive('variant-1')).rejects.toBeInstanceOf(StateTransitionError);
      expect(variants.updateStatus).not.toHaveBeenCalled();
    });

    it('fails with NOT_FOUND for a variant outside the current store', async () => {
      withTenant();
      variants.findById.mockResolvedValue(null);

      await expect(service.archive('variant-999')).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('listByProduct', () => {
    it('returns the variants of a product in the current store', async () => {
      withTenant();
      products.findById.mockResolvedValue(productRow);
      variants.findByProductId.mockResolvedValue([variantRow]);

      const result = await service.listByProduct('product-1');

      expect(variants.findByProductId).toHaveBeenCalledWith('store-1', 'product-1');
      expect(result).toHaveLength(1);
      expect(result[0].price).toBe(500);
    });

    it('fails with NOT_FOUND when the parent product is not in the current store', async () => {
      withTenant();
      products.findById.mockResolvedValue(null);

      await expect(service.listByProduct('product-999')).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
