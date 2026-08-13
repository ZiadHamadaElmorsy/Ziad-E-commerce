import { CategoryStatus } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { CategoryRepository } from './category.repository';

describe('CategoryRepository', () => {
  let prisma: {
    category: { findUnique: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  };
  let repository: CategoryRepository;
  let tx: {
    category: { create: jest.Mock; update: jest.Mock; updateMany: jest.Mock; findFirst: jest.Mock };
  };

  beforeEach(() => {
    prisma = { category: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() } };
    repository = new CategoryRepository(prisma as unknown as PrismaService);
    tx = {
      category: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findFirst: jest.fn(),
      },
    };
  });

  it('create persists the store-scoped row through the transaction client', async () => {
    (tx.category.create as jest.Mock).mockResolvedValue({ id: 'category-1' });

    await repository.create(tx as never, {
      storeId: 'store-1',
      name: 'T-Shirts',
      slug: 't-shirts',
      status: CategoryStatus.ACTIVE,
    });

    expect(tx.category.create).toHaveBeenCalledWith({
      data: {
        storeId: 'store-1',
        name: 'T-Shirts',
        slug: 't-shirts',
        status: CategoryStatus.ACTIVE,
      },
    });
  });

  it('update targets the composite store-scoped unique (storeId, id)', async () => {
    (tx.category.update as jest.Mock).mockResolvedValue({ id: 'category-1' });

    await repository.update(tx as never, 'store-1', 'category-1', { name: 'Updated' });

    expect(tx.category.update).toHaveBeenCalledWith({
      where: { storeId_id: { storeId: 'store-1', id: 'category-1' } },
      data: { name: 'Updated' },
    });
  });

  it('updateStatus uses a guarded conditional UPDATE (WHERE status = current)', async () => {
    (tx.category.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    await repository.updateStatus(
      tx as never,
      'store-1',
      'category-1',
      CategoryStatus.ACTIVE,
      CategoryStatus.ARCHIVED,
    );

    expect(tx.category.updateMany).toHaveBeenCalledWith({
      where: { id: 'category-1', storeId: 'store-1', status: CategoryStatus.ACTIVE },
      data: { status: CategoryStatus.ARCHIVED },
    });
  });

  it('findById uses the composite store-scoped unique (storeId, id)', async () => {
    prisma.category.findUnique.mockResolvedValue({ id: 'category-1' });

    await repository.findById('store-1', 'category-1');

    expect(prisma.category.findUnique).toHaveBeenCalledWith({
      where: { storeId_id: { storeId: 'store-1', id: 'category-1' } },
    });
  });

  it('findMany is store-scoped with pagination', async () => {
    prisma.category.findMany.mockResolvedValue([]);

    await repository.findMany('store-1', { skip: 10, take: 20, orderBy: { createdAt: 'desc' } });

    expect(prisma.category.findMany).toHaveBeenCalledWith({
      where: { storeId: 'store-1' },
      skip: 10,
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
  });

  it('count is store-scoped', async () => {
    prisma.category.count.mockResolvedValue(2);

    await repository.count('store-1');

    expect(prisma.category.count).toHaveBeenCalledWith({ where: { storeId: 'store-1' } });
  });

  it('existsBySlug checks the store-scoped slug through the transaction client', async () => {
    (tx.category.findFirst as jest.Mock).mockResolvedValue(null);

    await repository.existsBySlug(tx as never, 'store-1', 't-shirts');

    expect(tx.category.findFirst).toHaveBeenCalledWith({
      where: { storeId: 'store-1', slug: 't-shirts' },
      select: { id: true },
    });
  });
});
