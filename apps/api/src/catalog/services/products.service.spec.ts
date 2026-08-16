import { Prisma, ProductStatus, VariantStatus } from '@prisma/client';
import { RequestContextService } from '../../common/context/request-context.service';
import {
  ConflictError,
  NotFoundError,
  StateTransitionError,
  TenantContextRequiredError,
  ValidationError,
} from '../../common/errors/domain-exceptions';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { MediaRepository } from '../../media/repositories/media.repository';
import { CreateProductDto } from '../dto/create-product.dto';
import { ListProductsQueryDto } from '../dto/list-products-query.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { ProductMediaRepository } from '../repositories/product-media.repository';
import { ProductRepository } from '../repositories/product.repository';
import { ProductVariantRepository } from '../repositories/product-variant.repository';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  let requestContext: { getCurrent: jest.Mock };
  let products: {
    create: jest.Mock;
    update: jest.Mock;
    updateStatus: jest.Mock;
    existsBySlug: jest.Mock;
    findById: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
  };
  let variants: {
    create: jest.Mock;
    findByProductId: jest.Mock;
    countByProductId: jest.Mock;
  };
  let productMedia: {
    create: jest.Mock;
    deleteLink: jest.Mock;
    maxSortOrder: jest.Mock;
    findImagesByProduct: jest.Mock;
  };
  let media: { findByIdInStore: jest.Mock };
  let transaction: { run: jest.Mock; runWithTenant: jest.Mock };
  let service: ProductsService;

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
    name: 'Classic T-Shirt',
    sku: null,
    price: 0n,
    compareAtPrice: null,
    costPrice: null,
    status: VariantStatus.ACTIVE,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  beforeEach(() => {
    requestContext = { getCurrent: jest.fn() };
    products = {
      create: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
      existsBySlug: jest.fn(),
      findById: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    };
    variants = { create: jest.fn(), findByProductId: jest.fn(), countByProductId: jest.fn() };
    productMedia = {
      create: jest.fn(),
      deleteLink: jest.fn(),
      maxSortOrder: jest.fn(),
      findImagesByProduct: jest.fn(),
    };
    media = { findByIdInStore: jest.fn() };
    transaction = { run: jest.fn(), runWithTenant: jest.fn() };

    transaction.runWithTenant.mockImplementation(
      async (_storeId: string, work: (tx: unknown) => Promise<unknown>) => work({}),
    );

    service = new ProductsService(
      requestContext as unknown as RequestContextService,
      products as unknown as ProductRepository,
      variants as unknown as ProductVariantRepository,
      transaction as unknown as TransactionService,
      productMedia as unknown as ProductMediaRepository,
      media as unknown as MediaRepository,
    );
  });

  function withTenant(): void {
    requestContext.getCurrent.mockReturnValue({
      requestId: 'req-1',
      store: { id: 'store-1', slug: 'my-store', name: 'My Store', status: 'ACTIVE' },
    });
  }

  function productDto(overrides: Partial<CreateProductDto> = {}): CreateProductDto {
    return { name: 'Classic T-Shirt', ...overrides };
  }

  function listQuery(overrides: Partial<ListProductsQueryDto> = {}): ListProductsQueryDto {
    return { page: 1, limit: 20, sort: 'createdAt', order: 'desc', ...overrides };
  }

  function updateDto(overrides: Partial<UpdateProductDto> = {}): UpdateProductDto {
    return { name: 'Updated T-Shirt', ...overrides };
  }

  describe('create', () => {
    it('atomically creates the Product and its Default ProductVariant in one tenant-bound transaction', async () => {
      withTenant();
      products.existsBySlug.mockResolvedValue(false);
      products.create.mockResolvedValue(productRow);
      variants.create.mockResolvedValue(variantRow);

      const result = await service.create(productDto());

      expect(transaction.runWithTenant).toHaveBeenCalledWith('store-1', expect.any(Function));
      expect(products.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          storeId: 'store-1',
          name: 'Classic T-Shirt',
          slug: 'classic-t-shirt',
          status: ProductStatus.DRAFT,
        }),
      );
      expect(variants.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          storeId: 'store-1',
          productId: 'product-1',
          name: 'Classic T-Shirt',
          price: 0n,
          status: VariantStatus.ACTIVE,
        }),
      );
      expect(result).toMatchObject({
        id: 'product-1',
        slug: 'classic-t-shirt',
        status: 'DRAFT',
        variants: [{ id: 'variant-1', price: 0, status: 'ACTIVE' }],
      });
    });

    it('resolves store-scoped slug collisions with a -2 suffix', async () => {
      withTenant();
      products.existsBySlug.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      products.create.mockResolvedValue({ ...productRow, slug: 'classic-t-shirt-2' });
      variants.create.mockResolvedValue(variantRow);

      await service.create(productDto());

      expect(products.existsBySlug).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        'store-1',
        'classic-t-shirt',
      );
      expect(products.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ slug: 'classic-t-shirt-2' }),
      );
    });

    it('rejects a non-DRAFT initial status', async () => {
      withTenant();

      await expect(
        service.create(productDto({ status: ProductStatus.ACTIVE })),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(products.create).not.toHaveBeenCalled();
    });

    it('rolls back (rejects) when the mandatory Default ProductVariant creation fails', async () => {
      withTenant();
      products.existsBySlug.mockResolvedValue(false);
      products.create.mockResolvedValue(productRow);
      variants.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { target: ['store_id', 'sku'] },
        }),
      );

      // The whole creation fails; no product is returned, so the transaction
      // boundary (TransactionService) rolls back both writes.
      await expect(service.create(productDto())).rejects.toBeInstanceOf(ConflictError);
    });

    it('maps a store-scoped slug unique violation (P2002) to CONFLICT', async () => {
      withTenant();
      products.existsBySlug.mockResolvedValue(false);
      products.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { target: ['store_id', 'slug'] },
        }),
      );

      await expect(service.create(productDto())).rejects.toBeInstanceOf(ConflictError);
    });

    it('fails with TENANT_CONTEXT_REQUIRED when no tenant context is present', async () => {
      requestContext.getCurrent.mockReturnValue({ requestId: 'req-1' });

      await expect(service.create(productDto())).rejects.toBeInstanceOf(TenantContextRequiredError);
      expect(transaction.runWithTenant).not.toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('returns the product with its variants when it belongs to the current store', async () => {
      withTenant();
      products.findById.mockResolvedValue({ ...productRow, variants: [variantRow] });

      const result = await service.get('product-1');

      expect(products.findById).toHaveBeenCalledWith('store-1', 'product-1', true);
      expect(result.variants).toHaveLength(1);
    });

    it('fails with NOT_FOUND for a product outside the current store', async () => {
      withTenant();
      products.findById.mockResolvedValue(null);

      await expect(service.get('product-999')).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('list', () => {
    it('returns a paginated, store-scoped list with variants', async () => {
      withTenant();
      products.findMany.mockResolvedValue([{ ...productRow, variants: [variantRow] }]);
      products.count.mockResolvedValue(1);

      const result = await service.list(listQuery());

      expect(products.findMany).toHaveBeenCalledWith(
        'store-1',
        expect.objectContaining({ skip: 0, take: 20, status: undefined, categoryId: undefined }),
      );
      expect(result.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
      expect(result.items).toHaveLength(1);
    });

    it('passes search/status/categoryId filters and pagination through', async () => {
      withTenant();
      products.findMany.mockResolvedValue([]);
      products.count.mockResolvedValue(0);

      await service.list(
        listQuery({
          page: 2,
          limit: 10,
          search: 'shirt',
          status: ProductStatus.ACTIVE,
          categoryId: 'cat-1',
          sort: 'name',
          order: 'asc',
        }),
      );

      expect(products.findMany).toHaveBeenCalledWith(
        'store-1',
        expect.objectContaining({
          skip: 10,
          take: 10,
          search: 'shirt',
          status: ProductStatus.ACTIVE,
          categoryId: 'cat-1',
          orderBy: { name: 'asc' },
        }),
      );
    });
  });

  describe('update', () => {
    it('updates editable fields for a product in the current store', async () => {
      withTenant();
      products.update.mockResolvedValue({ ...productRow, name: 'Updated T-Shirt' });
      products.findById.mockResolvedValue({
        ...productRow,
        name: 'Updated T-Shirt',
        variants: [variantRow],
      });

      const result = await service.update('product-1', updateDto());

      expect(products.update).toHaveBeenCalledWith(expect.anything(), 'store-1', 'product-1', {
        name: 'Updated T-Shirt',
      });
      expect(result.name).toBe('Updated T-Shirt');
    });

    it('maps a missing-row update (P2025) to NOT_FOUND', async () => {
      withTenant();
      products.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: '6.19.3',
        }),
      );

      await expect(service.update('product-999', updateDto())).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe('attachMedia', () => {
    const mediaRow = {
      id: 'media-1',
      storeId: 'store-1',
      storagePath: 'store-1/media-1',
      mediaType: 'IMAGE',
      mimeType: 'image/png',
      sizeBytes: 100n,
      altText: null,
      createdAt: new Date('2026-08-12T00:00:00Z'),
    };

    it('appends the image at the end of the product gallery inside a tenant-bound transaction', async () => {
      withTenant();
      products.findById.mockResolvedValue(productRow);
      media.findByIdInStore.mockResolvedValue(mediaRow);
      productMedia.maxSortOrder.mockResolvedValue(1);
      productMedia.create.mockResolvedValue({ id: 'link-1' });
      products.findById.mockResolvedValueOnce(productRow); // existence check
      products.findById.mockResolvedValueOnce({
        ...productRow,
        variants: [variantRow],
        productMedia: [{ media: { id: 'media-1', altText: null } }],
      });

      const result = await service.attachMedia('product-1', 'media-1');

      expect(transaction.runWithTenant).toHaveBeenCalledWith('store-1', expect.any(Function));
      expect(productMedia.maxSortOrder).toHaveBeenCalledWith(expect.anything(), 'store-1', 'product-1');
      expect(productMedia.create).toHaveBeenCalledWith(expect.anything(), {
        storeId: 'store-1',
        productId: 'product-1',
        mediaId: 'media-1',
        sortOrder: 2,
      });
      expect(result.images).toEqual([{ id: 'media-1', altText: null }]);
    });

    it('fails with NOT_FOUND when the product is not in the current store', async () => {
      withTenant();
      products.findById.mockResolvedValue(null);

      await expect(service.attachMedia('product-999', 'media-1')).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(productMedia.create).not.toHaveBeenCalled();
    });

    it('fails with NOT_FOUND when the media belongs to another store (store-scoped on both sides)', async () => {
      withTenant();
      products.findById.mockResolvedValue(productRow);
      media.findByIdInStore.mockResolvedValue(null);

      await expect(service.attachMedia('product-1', 'media-999')).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(productMedia.create).not.toHaveBeenCalled();
    });

    it('maps a duplicate association (P2002 product_id,media_id) to CONFLICT', async () => {
      withTenant();
      products.findById.mockResolvedValue(productRow);
      media.findByIdInStore.mockResolvedValue(mediaRow);
      productMedia.maxSortOrder.mockResolvedValue(0);
      productMedia.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { target: ['product_id', 'media_id'] },
        }),
      );

      await expect(service.attachMedia('product-1', 'media-1')).rejects.toBeInstanceOf(
        ConflictError,
      );
    });
  });

  describe('removeMedia', () => {
    it('removes the product image association (store-scoped) without touching the media row', async () => {
      withTenant();
      products.findById.mockResolvedValue(productRow);
      productMedia.deleteLink.mockResolvedValue({ count: 1 });

      await expect(service.removeMedia('product-1', 'media-1')).resolves.toBeUndefined();

      expect(productMedia.deleteLink).toHaveBeenCalledWith(
        expect.anything(),
        'store-1',
        'product-1',
        'media-1',
      );
    });

    it('fails with NOT_FOUND when the association is absent or cross-tenant', async () => {
      withTenant();
      products.findById.mockResolvedValue(productRow);
      productMedia.deleteLink.mockResolvedValue({ count: 0 });

      await expect(service.removeMedia('product-1', 'media-999')).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('fails with NOT_FOUND when the product is not in the current store', async () => {
      withTenant();
      products.findById.mockResolvedValue(null);

      await expect(service.removeMedia('product-999', 'media-1')).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(productMedia.deleteLink).not.toHaveBeenCalled();
    });
  });

  describe('lifecycle transitions', () => {
    function mockTransitionable(currentStatus: ProductStatus, targetStatus: ProductStatus): void {
      let updated = false;
      products.updateStatus.mockImplementation(async () => {
        updated = true;
        return { count: 1 };
      });
      products.findById.mockImplementation(
        (_storeId: string, _id: string, includeVariants?: boolean) => {
          const status = updated ? targetStatus : currentStatus;
          if (includeVariants) {
            return Promise.resolve({ ...productRow, status, variants: [variantRow] });
          }
          return Promise.resolve({ ...productRow, status });
        },
      );
      variants.countByProductId.mockResolvedValue(1);
    }

    it('publishes a DRAFT product to ACTIVE with a guarded conditional UPDATE', async () => {
      withTenant();
      mockTransitionable(ProductStatus.DRAFT, ProductStatus.ACTIVE);

      const result = await service.publish('product-1');

      expect(products.updateStatus).toHaveBeenCalledWith(
        expect.anything(),
        'store-1',
        'product-1',
        ProductStatus.DRAFT,
        ProductStatus.ACTIVE,
      );
      expect(result.status).toBe(ProductStatus.ACTIVE);
    });

    it('rejects publishing a product without at least one variant', async () => {
      withTenant();
      mockTransitionable(ProductStatus.DRAFT, ProductStatus.ACTIVE);
      variants.countByProductId.mockResolvedValue(0);

      await expect(service.publish('product-1')).rejects.toBeInstanceOf(StateTransitionError);
      expect(products.updateStatus).not.toHaveBeenCalled();
    });

    it('rejects publishing from ARCHIVED (terminal state)', async () => {
      withTenant();
      mockTransitionable(ProductStatus.ARCHIVED, ProductStatus.ACTIVE);

      await expect(service.publish('product-1')).rejects.toBeInstanceOf(StateTransitionError);
      expect(products.updateStatus).not.toHaveBeenCalled();
    });

    it('unpublishes an ACTIVE product to DRAFT', async () => {
      withTenant();
      mockTransitionable(ProductStatus.ACTIVE, ProductStatus.DRAFT);

      const result = await service.unpublish('product-1');

      expect(products.updateStatus).toHaveBeenCalledWith(
        expect.anything(),
        'store-1',
        'product-1',
        ProductStatus.ACTIVE,
        ProductStatus.DRAFT,
      );
      expect(result.status).toBe(ProductStatus.DRAFT);
    });

    it('rejects unpublishing a DRAFT product', async () => {
      withTenant();
      mockTransitionable(ProductStatus.DRAFT, ProductStatus.DRAFT);

      await expect(service.unpublish('product-1')).rejects.toBeInstanceOf(StateTransitionError);
    });

    it('archives a DRAFT or ACTIVE product to ARCHIVED', async () => {
      withTenant();
      mockTransitionable(ProductStatus.ACTIVE, ProductStatus.ARCHIVED);

      const result = await service.archive('product-1');

      expect(products.updateStatus).toHaveBeenCalledWith(
        expect.anything(),
        'store-1',
        'product-1',
        ProductStatus.ACTIVE,
        ProductStatus.ARCHIVED,
      );
      expect(result.status).toBe(ProductStatus.ARCHIVED);
    });

    it('rejects archiving an already-archived product', async () => {
      withTenant();
      mockTransitionable(ProductStatus.ARCHIVED, ProductStatus.ARCHIVED);

      await expect(service.archive('product-1')).rejects.toBeInstanceOf(StateTransitionError);
    });

    it('fails with NOT_FOUND when the target product is not in the current store', async () => {
      withTenant();
      products.findById.mockResolvedValue(null);

      await expect(service.publish('product-999')).rejects.toBeInstanceOf(NotFoundError);
      expect(products.updateStatus).not.toHaveBeenCalled();
    });
  });
});
