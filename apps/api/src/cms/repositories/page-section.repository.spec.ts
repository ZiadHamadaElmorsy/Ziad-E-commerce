import type { PrismaService } from '../../prisma/prisma.service';
import { PageSectionRepository } from './page-section.repository';

describe('PageSectionRepository', () => {
  let prisma: { pageSection: { findMany: jest.Mock; findFirst: jest.Mock } };
  let repository: PageSectionRepository;
  let tx: {
    pageSection: { create: jest.Mock; updateMany: jest.Mock; deleteMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = { pageSection: { findMany: jest.fn(), findFirst: jest.fn() } };
    repository = new PageSectionRepository(prisma as unknown as PrismaService);
    tx = {
      pageSection: { create: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn() },
    };
  });

  it('create persists the store-scoped row through the transaction client', async () => {
    (tx.pageSection.create as jest.Mock).mockResolvedValue({ id: 'section-1' });

    await repository.create(tx as never, {
      storeId: 'store-1',
      pageId: 'page-1',
      sectionType: 'hero',
      content: { title: 'Hero' },
      sortOrder: 0,
    });

    expect(tx.pageSection.create).toHaveBeenCalledWith({
      data: {
        storeId: 'store-1',
        pageId: 'page-1',
        sectionType: 'hero',
        content: { title: 'Hero' },
        sortOrder: 0,
      },
    });
  });

  it('shiftUpFrom increments the order of sections at/after the insertion point', async () => {
    (tx.pageSection.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    await repository.shiftUpFrom(tx as never, 'store-1', 'page-1', 0);

    expect(tx.pageSection.updateMany).toHaveBeenCalledWith({
      where: { storeId: 'store-1', pageId: 'page-1', sortOrder: { gte: 0 } },
      data: { sortOrder: { increment: 1 } },
    });
  });

  it('updateGuarded scopes by section id + store + page', async () => {
    (tx.pageSection.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    await repository.updateGuarded(tx as never, 'store-1', 'page-1', 'section-1', {
      sectionType: 'text',
    });

    expect(tx.pageSection.updateMany).toHaveBeenCalledWith({
      where: { id: 'section-1', storeId: 'store-1', pageId: 'page-1' },
      data: { sectionType: 'text' },
    });
  });

  it('delete scopes by section id + store + page', async () => {
    (tx.pageSection.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

    await repository.delete(tx as never, 'store-1', 'page-1', 'section-1');

    expect(tx.pageSection.deleteMany).toHaveBeenCalledWith({
      where: { id: 'section-1', storeId: 'store-1', pageId: 'page-1' },
    });
  });

  it('findByPage returns sections in defined order', async () => {
    prisma.pageSection.findMany.mockResolvedValue([]);

    await repository.findByPage('store-1', 'page-1');

    expect(prisma.pageSection.findMany).toHaveBeenCalledWith({
      where: { storeId: 'store-1', pageId: 'page-1' },
      orderBy: { sortOrder: 'asc' },
    });
  });

  it('findById is store-scoped and page-scoped', async () => {
    prisma.pageSection.findFirst.mockResolvedValue({ id: 'section-1' });

    await repository.findById('store-1', 'page-1', 'section-1');

    expect(prisma.pageSection.findFirst).toHaveBeenCalledWith({
      where: { id: 'section-1', storeId: 'store-1', pageId: 'page-1' },
    });
  });

  it('applyOrders writes every order assignment inside the transaction', async () => {
    (tx.pageSection.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    await repository.applyOrders(tx as never, 'store-1', 'page-1', [
      { id: 'section-2', sortOrder: 0 },
      { id: 'section-1', sortOrder: 1 },
    ]);

    expect(tx.pageSection.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.pageSection.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'section-2', storeId: 'store-1', pageId: 'page-1' },
      data: { sortOrder: 0 },
    });
    expect(tx.pageSection.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'section-1', storeId: 'store-1', pageId: 'page-1' },
      data: { sortOrder: 1 },
    });
  });
});
