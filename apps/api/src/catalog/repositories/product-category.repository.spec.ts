import { ProductCategoryRepository } from './product-category.repository';

describe('ProductCategoryRepository', () => {
  let repository: ProductCategoryRepository;
  let tx: { productCategory: { create: jest.Mock; deleteMany: jest.Mock } };
  let prisma: { productCategory: { findMany: jest.Mock } };

  beforeEach(() => {
    tx = { productCategory: { create: jest.fn(), deleteMany: jest.fn() } };
    prisma = { productCategory: { findMany: jest.fn() } };
    repository = new ProductCategoryRepository(prisma as never);
  });

  it('create persists the store-scoped link through the transaction client', async () => {
    (tx.productCategory.create as jest.Mock).mockResolvedValue({
      id: 'link-1',
      storeId: 'store-1',
      productId: 'product-1',
      categoryId: 'category-1',
    });

    await repository.create(tx as never, {
      storeId: 'store-1',
      productId: 'product-1',
      categoryId: 'category-1',
    });

    expect(tx.productCategory.create).toHaveBeenCalledWith({
      data: { storeId: 'store-1', productId: 'product-1', categoryId: 'category-1' },
    });
  });

  it('deleteLink is store-scoped (tenant-safe unassign)', async () => {
    (tx.productCategory.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

    await repository.deleteLink(tx as never, 'store-1', 'product-1', 'category-1');

    expect(tx.productCategory.deleteMany).toHaveBeenCalledWith({
      where: { storeId: 'store-1', productId: 'product-1', categoryId: 'category-1' },
    });
  });

  it('findCategoriesByProduct returns the store-scoped categories of a product', async () => {
    (prisma.productCategory.findMany as jest.Mock).mockResolvedValue([
      {
        category: {
          id: 'category-1',
          storeId: 'store-1',
          name: 'T-Shirts',
          slug: 't-shirts',
          description: null,
          status: 'ACTIVE',
          createdAt: new Date('2026-08-12T00:00:00Z'),
          updatedAt: new Date('2026-08-12T00:00:00Z'),
        },
      },
    ]);

    const result = await repository.findCategoriesByProduct('store-1', 'product-1');

    expect(prisma.productCategory.findMany).toHaveBeenCalledWith({
      where: { storeId: 'store-1', productId: 'product-1' },
      include: { category: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(result).toEqual([
      expect.objectContaining({ id: 'category-1', name: 'T-Shirts', slug: 't-shirts' }),
    ]);
  });
});
