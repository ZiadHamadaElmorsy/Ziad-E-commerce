import { Prisma, CategoryStatus, ProductStatus } from '@prisma/client';
import { RequestContextService } from '../../common/context/request-context.service';
import {
  ConflictError,
  NotFoundError,
  StateTransitionError,
  TenantContextRequiredError,
} from '../../common/errors/domain-exceptions';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { ListCategoriesQueryDto } from '../dto/list-categories-query.dto';
import { UpdateCategoryDto } from '../dto/update-category.dto';
import { CategoryRepository } from '../repositories/category.repository';
import { ProductCategoryRepository } from '../repositories/product-category.repository';
import { ProductRepository } from '../repositories/product.repository';
import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  let requestContext: { getCurrent: jest.Mock };
  let categories: {
    create: jest.Mock;
    update: jest.Mock;
    updateStatus: jest.Mock;
    existsBySlug: jest.Mock;
    findById: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
  };
  let products: { findById: jest.Mock };
  let productCategories: {
    create: jest.Mock;
    deleteLink: jest.Mock;
    findCategoriesByProduct: jest.Mock;
  };
  let transaction: { run: jest.Mock; runWithTenant: jest.Mock };
  let service: CategoriesService;

  const categoryRow = {
    id: 'category-1',
    storeId: 'store-1',
    name: 'T-Shirts',
    slug: 't-shirts',
    description: null,
    status: CategoryStatus.ACTIVE,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

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

  beforeEach(() => {
    requestContext = { getCurrent: jest.fn() };
    categories = {
      create: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
      existsBySlug: jest.fn(),
      findById: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    };
    products = { findById: jest.fn() };
    productCategories = {
      create: jest.fn(),
      deleteLink: jest.fn(),
      findCategoriesByProduct: jest.fn(),
    };
    transaction = { run: jest.fn(), runWithTenant: jest.fn() };

    transaction.runWithTenant.mockImplementation(
      async (_storeId: string, work: (tx: unknown) => Promise<unknown>) => work({}),
    );

    service = new CategoriesService(
      requestContext as unknown as RequestContextService,
      categories as unknown as CategoryRepository,
      products as unknown as ProductRepository,
      productCategories as unknown as ProductCategoryRepository,
      transaction as unknown as TransactionService,
    );
  });

  function withTenant(): void {
    requestContext.getCurrent.mockReturnValue({
      requestId: 'req-1',
      store: { id: 'store-1', slug: 'my-store', name: 'My Store', status: 'ACTIVE' },
    });
  }

  function createDto(overrides: Partial<CreateCategoryDto> = {}): CreateCategoryDto {
    return { name: 'T-Shirts', ...overrides };
  }

  function listQuery(overrides: Partial<ListCategoriesQueryDto> = {}): ListCategoriesQueryDto {
    return { page: 1, limit: 20, ...overrides };
  }

  function updateDto(overrides: Partial<UpdateCategoryDto> = {}): UpdateCategoryDto {
    return { name: 'Updated', ...overrides };
  }

  describe('create', () => {
    it('creates a store-scoped category with an auto-generated ACTIVE status', async () => {
      withTenant();
      categories.existsBySlug.mockResolvedValue(false);
      categories.create.mockResolvedValue(categoryRow);

      const result = await service.create(createDto());

      expect(categories.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          storeId: 'store-1',
          name: 'T-Shirts',
          slug: 't-shirts',
          status: CategoryStatus.ACTIVE,
        }),
      );
      expect(result).toMatchObject({ id: 'category-1', slug: 't-shirts', status: 'ACTIVE' });
    });

    it('resolves store-scoped slug collisions with a -2 suffix', async () => {
      withTenant();
      categories.existsBySlug.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      categories.create.mockResolvedValue({ ...categoryRow, slug: 't-shirts-2' });

      await service.create(createDto());

      expect(categories.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ slug: 't-shirts-2' }),
      );
    });

    it('maps a store-scoped slug unique violation (P2002) to CONFLICT', async () => {
      withTenant();
      categories.existsBySlug.mockResolvedValue(false);
      categories.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { target: ['store_id', 'slug'] },
        }),
      );

      await expect(service.create(createDto())).rejects.toBeInstanceOf(ConflictError);
    });

    it('fails with TENANT_CONTEXT_REQUIRED when no tenant context is present', async () => {
      requestContext.getCurrent.mockReturnValue({ requestId: 'req-1' });

      await expect(service.create(createDto())).rejects.toBeInstanceOf(TenantContextRequiredError);
      expect(categories.create).not.toHaveBeenCalled();
    });
  });

  describe('get/list/update', () => {
    it('returns a category that belongs to the current store', async () => {
      withTenant();
      categories.findById.mockResolvedValue(categoryRow);

      const result = await service.get('category-1');

      expect(categories.findById).toHaveBeenCalledWith('store-1', 'category-1');
      expect(result.slug).toBe('t-shirts');
    });

    it('fails with NOT_FOUND for a category outside the current store', async () => {
      withTenant();
      categories.findById.mockResolvedValue(null);

      await expect(service.get('category-999')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('returns a paginated, store-scoped list', async () => {
      withTenant();
      categories.findMany.mockResolvedValue([categoryRow]);
      categories.count.mockResolvedValue(1);

      const result = await service.list(listQuery());

      expect(categories.findMany).toHaveBeenCalledWith('store-1', {
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
      });
      expect(result.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    });

    it('updates editable fields for a category in the current store', async () => {
      withTenant();
      categories.update.mockResolvedValue({ ...categoryRow, name: 'Updated' });

      const result = await service.update('category-1', updateDto());

      expect(categories.update).toHaveBeenCalledWith(expect.anything(), 'store-1', 'category-1', {
        name: 'Updated',
      });
      expect(result.name).toBe('Updated');
    });
  });

  describe('archive', () => {
    it('archives an ACTIVE category with a guarded conditional UPDATE', async () => {
      withTenant();
      let updated = false;
      categories.updateStatus.mockImplementation(async () => {
        updated = true;
        return { count: 1 };
      });
      categories.findById.mockImplementation(() =>
        Promise.resolve({
          ...categoryRow,
          status: updated ? CategoryStatus.ARCHIVED : CategoryStatus.ACTIVE,
        }),
      );

      const result = await service.archive('category-1');

      expect(categories.updateStatus).toHaveBeenCalledWith(
        expect.anything(),
        'store-1',
        'category-1',
        CategoryStatus.ACTIVE,
        CategoryStatus.ARCHIVED,
      );
      expect(result.status).toBe(CategoryStatus.ARCHIVED);
    });

    it('rejects archiving an already-archived category (terminal state)', async () => {
      withTenant();
      categories.findById.mockResolvedValue({ ...categoryRow, status: CategoryStatus.ARCHIVED });

      await expect(service.archive('category-1')).rejects.toBeInstanceOf(StateTransitionError);
    });
  });

  describe('ProductCategory linking', () => {
    it('assigns a product to a category when both exist in the current store', async () => {
      withTenant();
      products.findById.mockResolvedValue(productRow);
      categories.findById.mockResolvedValue(categoryRow);
      productCategories.create.mockResolvedValue({
        id: 'link-1',
        storeId: 'store-1',
        productId: 'product-1',
        categoryId: 'category-1',
      });

      const result = await service.assignProduct('product-1', 'category-1');

      expect(productCategories.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          storeId: 'store-1',
          productId: 'product-1',
          categoryId: 'category-1',
        }),
      );
      expect(result).toEqual({ productId: 'product-1', categoryId: 'category-1' });
    });

    it('fails with NOT_FOUND when the product is not in the current store', async () => {
      withTenant();
      products.findById.mockResolvedValue(null);
      categories.findById.mockResolvedValue(categoryRow);

      await expect(service.assignProduct('product-999', 'category-1')).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(productCategories.create).not.toHaveBeenCalled();
    });

    it('fails with NOT_FOUND when the category is not in the current store', async () => {
      withTenant();
      products.findById.mockResolvedValue(productRow);
      categories.findById.mockResolvedValue(null);

      await expect(service.assignProduct('product-1', 'category-999')).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(productCategories.create).not.toHaveBeenCalled();
    });

    it('maps a duplicate link (P2002) to CONFLICT', async () => {
      withTenant();
      products.findById.mockResolvedValue(productRow);
      categories.findById.mockResolvedValue(categoryRow);
      productCategories.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { target: ['product_id', 'category_id'] },
        }),
      );

      await expect(service.assignProduct('product-1', 'category-1')).rejects.toBeInstanceOf(
        ConflictError,
      );
    });

    it('removes an existing link (unassign operation)', async () => {
      withTenant();
      productCategories.deleteLink.mockResolvedValue({ count: 1 });

      await expect(
        service.removeProductFromCategory('product-1', 'category-1'),
      ).resolves.toBeUndefined();

      expect(productCategories.deleteLink).toHaveBeenCalledWith(
        expect.anything(),
        'store-1',
        'product-1',
        'category-1',
      );
    });

    it('fails with NOT_FOUND when removing a non-existent link', async () => {
      withTenant();
      productCategories.deleteLink.mockResolvedValue({ count: 0 });

      await expect(
        service.removeProductFromCategory('product-1', 'category-1'),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('returns the categories assigned to a product in the current store', async () => {
      withTenant();
      products.findById.mockResolvedValue(productRow);
      productCategories.findCategoriesByProduct.mockResolvedValue([categoryRow]);

      const result = await service.listForProduct('product-1');

      expect(products.findById).toHaveBeenCalledWith('store-1', 'product-1');
      expect(productCategories.findCategoriesByProduct).toHaveBeenCalledWith(
        'store-1',
        'product-1',
      );
      expect(result).toEqual([
        expect.objectContaining({ id: 'category-1', slug: 't-shirts', status: 'ACTIVE' }),
      ]);
    });

    it('fails with NOT_FOUND when listing categories for a product outside the store', async () => {
      withTenant();
      products.findById.mockResolvedValue(null);

      await expect(service.listForProduct('product-999')).rejects.toBeInstanceOf(NotFoundError);
      expect(productCategories.findCategoriesByProduct).not.toHaveBeenCalled();
    });
  });
});
