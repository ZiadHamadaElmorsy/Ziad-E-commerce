import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { StoreRepository } from './store.repository';

describe('StoreRepository', () => {
  let prisma: { store: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock } };
  let repository: StoreRepository;
  let tx: Prisma.TransactionClient;

  beforeEach(() => {
    prisma = {
      store: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    };
    repository = new StoreRepository(prisma as unknown as PrismaService);
    tx = { store: { create: jest.fn(), update: jest.fn() } } as unknown as Prisma.TransactionClient;
  });

  it('create persists name, slug and currency through the transaction client', async () => {
    (tx.store.create as jest.Mock).mockResolvedValue({ id: 'store-1' });

    await repository.create(tx, { name: 'My Store', slug: 'my-store', currency: 'EGP' });

    expect(tx.store.create).toHaveBeenCalledWith({
      data: { name: 'My Store', slug: 'my-store', currency: 'EGP' },
    });
  });

  it('create omits optional fields that are not provided', async () => {
    (tx.store.create as jest.Mock).mockResolvedValue({ id: 'store-1' });

    await repository.create(tx, { name: 'My Store', slug: 'my-store' });

    expect(tx.store.create).toHaveBeenCalledWith({
      data: { name: 'My Store', slug: 'my-store' },
    });
  });

  it('findById looks up by id', async () => {
    prisma.store.findUnique.mockResolvedValue({ id: 'store-1' });

    await repository.findById('store-1');

    expect(prisma.store.findUnique).toHaveBeenCalledWith({ where: { id: 'store-1' } });
  });

  it('findBySlug looks up by the globally unique slug', async () => {
    prisma.store.findUnique.mockResolvedValue({ id: 'store-1', slug: 'my-store' });

    await repository.findBySlug('my-store');

    expect(prisma.store.findUnique).toHaveBeenCalledWith({ where: { slug: 'my-store' } });
  });

  it('update persists the given fields for the id through the transaction client', async () => {
    (tx.store.update as jest.Mock).mockResolvedValue({ id: 'store-1', name: 'Updated' });

    await repository.update(tx, 'store-1', { name: 'Updated' });

    expect(tx.store.update).toHaveBeenCalledWith({
      where: { id: 'store-1' },
      data: { name: 'Updated' },
    });
  });
});
