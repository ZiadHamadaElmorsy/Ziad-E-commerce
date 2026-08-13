import { PageStatus } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { PageRepository } from './page.repository';

describe('PageRepository', () => {
  let prisma: {
    page: { findUnique: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  };
  let repository: PageRepository;
  let tx: {
    page: { create: jest.Mock; updateMany: jest.Mock; findFirst: jest.Mock };
  };

  beforeEach(() => {
    prisma = { page: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() } };
    repository = new PageRepository(prisma as unknown as PrismaService);
    tx = {
      page: { create: jest.fn(), updateMany: jest.fn(), findFirst: jest.fn() },
    };
  });

  it('create persists the store-scoped row through the transaction client', async () => {
    (tx.page.create as jest.Mock).mockResolvedValue({ id: 'page-1' });

    await repository.create(tx as never, {
      storeId: 'store-1',
      title: 'About',
      slug: 'about',
    });

    expect(tx.page.create).toHaveBeenCalledWith({
      data: { storeId: 'store-1', title: 'About', slug: 'about' },
    });
  });

  it('updateGuarded uses a guarded conditional UPDATE (WHERE status = current)', async () => {
    (tx.page.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    await repository.updateGuarded(tx as never, 'store-1', 'page-1', PageStatus.DRAFT, {
      status: PageStatus.PUBLISHED,
      title: 'Updated',
    });

    expect(tx.page.updateMany).toHaveBeenCalledWith({
      where: { id: 'page-1', storeId: 'store-1', status: PageStatus.DRAFT },
      data: { status: PageStatus.PUBLISHED, title: 'Updated' },
    });
  });

  it('existsBySlug checks the store-scoped slug through the transaction client', async () => {
    (tx.page.findFirst as jest.Mock).mockResolvedValue(null);

    await repository.existsBySlug(tx as never, 'store-1', 'about');

    expect(tx.page.findFirst).toHaveBeenCalledWith({
      where: { storeId: 'store-1', slug: 'about' },
      select: { id: true },
    });
  });

  it('findById uses the composite store-scoped unique (storeId, id) with sections ordered', async () => {
    prisma.page.findUnique.mockResolvedValue({ id: 'page-1' });

    await repository.findById('store-1', 'page-1');

    expect(prisma.page.findUnique).toHaveBeenCalledWith({
      where: { storeId_id: { storeId: 'store-1', id: 'page-1' } },
      include: { sections: { orderBy: { sortOrder: 'asc' } } },
    });
  });

  it('findMany is store-scoped with pagination and ordered sections', async () => {
    prisma.page.findMany.mockResolvedValue([]);

    await repository.findMany('store-1', { skip: 10, take: 20, orderBy: { createdAt: 'desc' } });

    expect(prisma.page.findMany).toHaveBeenCalledWith({
      where: { storeId: 'store-1' },
      skip: 10,
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: { sections: { orderBy: { sortOrder: 'asc' } } },
    });
  });

  it('count is store-scoped', async () => {
    prisma.page.count.mockResolvedValue(2);

    await repository.count('store-1');

    expect(prisma.page.count).toHaveBeenCalledWith({ where: { storeId: 'store-1' } });
  });
});
