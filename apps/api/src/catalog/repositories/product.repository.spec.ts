import { ProductStatus } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { ProductRepository } from './product.repository';

describe('ProductRepository', () => {
  let prisma: {
    product: { findUnique: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  };
  let repository: ProductRepository;
  let tx: {
    product: { create: jest.Mock; update: jest.Mock; updateMany: jest.Mock; findFirst: jest.Mock };
  };

  beforeEach(() => {
    prisma = { product: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() } };
    repository = new ProductRepository(prisma as unknown as PrismaService);
    tx = {
      product: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findFirst: jest.fn(),
      },
    };
  });

  it('create persists the store-scoped row through the transaction client', async () => {
    (tx.product.create as jest.Mock).mockResolvedValue({ id: 'product-1' });

    await repository.create(tx as never, {
      storeId: 'store-1',
      name: 'Classic T-Shirt',
      slug: 'classic-t-shirt',
      status: ProductStatus.DRAFT,
    });

    expect(tx.product.create).toHaveBeenCalledWith({
      data: {
        storeId: 'store-1',
        name: 'Classic T-Shirt',
        slug: 'classic-t-shirt',
        status: ProductStatus.DRAFT,
      },
    });
  });

  it('update targets the composite store-scoped unique (storeId, id)', async () => {
    (tx.product.update as jest.Mock).mockResolvedValue({ id: 'product-1' });

    await repository.update(tx as never, 'store-1', 'product-1', { name: 'Updated' });

    expect(tx.product.update).toHaveBeenCalledWith({
      where: { storeId_id: { storeId: 'store-1', id: 'product-1' } },
      data: { name: 'Updated' },
    });
  });

  it('updateStatus uses a guarded conditional UPDATE (WHERE status = current)', async () => {
    (tx.product.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    await repository.updateStatus(
      tx as never,
      'store-1',
      'product-1',
      ProductStatus.DRAFT,
      ProductStatus.ACTIVE,
    );

    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'product-1', storeId: 'store-1', status: ProductStatus.DRAFT },
      data: { status: ProductStatus.ACTIVE },
    });
  });

  it('findById uses the composite store-scoped unique (storeId, id)', async () => {
    prisma.product.findUnique.mockResolvedValue({ id: 'product-1' });

    await repository.findById('store-1', 'product-1');

    expect(prisma.product.findUnique).toHaveBeenCalledWith({
      where: { storeId_id: { storeId: 'store-1', id: 'product-1' } },
    });
  });

  it('findMany always scopes by storeId and supports search/status/categoryId filters', async () => {
    prisma.product.findMany.mockResolvedValue([]);

    await repository.findMany('store-1', {
      search: 'shirt',
      status: ProductStatus.ACTIVE,
      categoryId: 'category-1',
      skip: 0,
      take: 20,
      orderBy: { createdAt: 'desc' },
    });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          storeId: 'store-1',
          status: ProductStatus.ACTIVE,
          OR: [
            { name: { contains: 'shirt', mode: 'insensitive' } },
            { slug: { contains: 'shirt', mode: 'insensitive' } },
          ],
          productCategories: { some: { categoryId: 'category-1' } },
        },
      }),
    );
  });

  it('count is store-scoped', async () => {
    prisma.product.count.mockResolvedValue(3);

    await repository.count('store-1', {
      skip: 0,
      take: 20,
      orderBy: { createdAt: 'desc' },
    });

    expect(prisma.product.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: { storeId: 'store-1' } }),
    );
  });

  it('existsBySlug checks the store-scoped slug through the transaction client', async () => {
    (tx.product.findFirst as jest.Mock).mockResolvedValue(null);

    await repository.existsBySlug(tx as never, 'store-1', 'classic-t-shirt');

    expect(tx.product.findFirst).toHaveBeenCalledWith({
      where: { storeId: 'store-1', slug: 'classic-t-shirt' },
      select: { id: true },
    });
  });
});
