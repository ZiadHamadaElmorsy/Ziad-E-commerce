import { CategoryStatus, PageStatus, ProductStatus, VariantStatus } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { StorefrontRepository } from './storefront.repository';

describe('StorefrontRepository', () => {
  let prisma: {
    store: { findUnique: jest.Mock };
    product: { findMany: jest.Mock; count: jest.Mock; findFirst: jest.Mock };
    category: { findMany: jest.Mock; count: jest.Mock; findFirst: jest.Mock };
    page: { findFirst: jest.Mock };
  };
  let repository: StorefrontRepository;

  beforeEach(() => {
    prisma = {
      store: { findUnique: jest.fn() },
      product: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
      category: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
      page: { findFirst: jest.fn() },
    };
    repository = new StorefrontRepository(prisma as unknown as PrismaService);
  });

  it('findStoreBySlug looks up the store by its globally unique slug', async () => {
    prisma.store.findUnique.mockResolvedValue({ id: 'store-1' });

    await repository.findStoreBySlug('my-store');

    expect(prisma.store.findUnique).toHaveBeenCalledWith({ where: { slug: 'my-store' } });
  });

  it('findActiveProducts is store-scoped, filters ACTIVE, applies name search and pagination', async () => {
    prisma.product.findMany.mockResolvedValue([]);

    await repository.findActiveProducts('store-1', { search: 'shirt', skip: 10, take: 20 });

    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: {
        storeId: 'store-1',
        status: ProductStatus.ACTIVE,
        name: { contains: 'shirt', mode: 'insensitive' },
      },
      skip: 10,
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: {
        variants: {
          where: { status: VariantStatus.ACTIVE },
          include: { inventory: true },
          orderBy: { createdAt: 'asc' },
        },
        productMedia: { include: { media: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
  });

  it('findActiveProducts omits the search filter when absent', async () => {
    prisma.product.findMany.mockResolvedValue([]);

    await repository.findActiveProducts('store-1', { skip: 0, take: 20 });

    const call = (prisma.product.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where).toEqual({ storeId: 'store-1', status: ProductStatus.ACTIVE });
  });

  it('countActiveProducts is store-scoped and search-aware', async () => {
    prisma.product.count.mockResolvedValue(3);

    await repository.countActiveProducts('store-1', 'shirt');

    expect(prisma.product.count).toHaveBeenCalledWith({
      where: {
        storeId: 'store-1',
        status: ProductStatus.ACTIVE,
        name: { contains: 'shirt', mode: 'insensitive' },
      },
    });
  });

  it('findActiveProductBySlug is store-scoped and ACTIVE-only', async () => {
    prisma.product.findFirst.mockResolvedValue(null);

    await repository.findActiveProductBySlug('store-1', 'classic-t-shirt');

    expect(prisma.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { storeId: 'store-1', slug: 'classic-t-shirt', status: ProductStatus.ACTIVE },
      }),
    );
  });

  it('findActiveCategories is store-scoped and ACTIVE-only with pagination', async () => {
    prisma.category.findMany.mockResolvedValue([]);

    await repository.findActiveCategories('store-1', { skip: 0, take: 20 });

    expect(prisma.category.findMany).toHaveBeenCalledWith({
      where: { storeId: 'store-1', status: CategoryStatus.ACTIVE },
      skip: 0,
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
  });

  it('findActiveProductsByCategory filters ACTIVE products through the category link', async () => {
    prisma.product.findMany.mockResolvedValue([]);

    await repository.findActiveProductsByCategory('store-1', 'category-1', { skip: 0, take: 20 });

    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: {
        storeId: 'store-1',
        status: ProductStatus.ACTIVE,
        productCategories: { some: { categoryId: 'category-1' } },
      },
      skip: 0,
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: expect.anything(),
    });
  });

  it('findPublishedPageBySlug is store-scoped, PUBLISHED-only, with sections ordered', async () => {
    prisma.page.findFirst.mockResolvedValue(null);

    await repository.findPublishedPageBySlug('store-1', 'about');

    expect(prisma.page.findFirst).toHaveBeenCalledWith({
      where: { storeId: 'store-1', slug: 'about', status: PageStatus.PUBLISHED },
      include: { sections: { orderBy: { sortOrder: 'asc' } } },
    });
  });
});
