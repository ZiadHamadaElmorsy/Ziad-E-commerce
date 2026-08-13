import type { PrismaService } from '../../prisma/prisma.service';
import { NavigationRepository } from './navigation.repository';

describe('NavigationRepository', () => {
  let prisma: { navigation: { findFirst: jest.Mock } };
  let repository: NavigationRepository;
  let tx: { navigation: { findFirst: jest.Mock; create: jest.Mock; updateMany: jest.Mock } };

  beforeEach(() => {
    prisma = { navigation: { findFirst: jest.fn() } };
    repository = new NavigationRepository(prisma as unknown as PrismaService);
    tx = {
      navigation: { findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
    };
  });

  it('findForStore resolves the oldest navigation row of the store', async () => {
    prisma.navigation.findFirst.mockResolvedValue({ id: 'nav-1' });

    await repository.findForStore('store-1');

    expect(prisma.navigation.findFirst).toHaveBeenCalledWith({
      where: { storeId: 'store-1' },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('findForStoreTx uses the transaction client', async () => {
    (tx.navigation.findFirst as jest.Mock).mockResolvedValue({ id: 'nav-1' });

    await repository.findForStoreTx(tx as never, 'store-1');

    expect(tx.navigation.findFirst).toHaveBeenCalledWith({
      where: { storeId: 'store-1' },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('create persists the store-scoped row through the transaction client', async () => {
    (tx.navigation.create as jest.Mock).mockResolvedValue({ id: 'nav-1' });

    await repository.create(tx as never, { storeId: 'store-1', name: 'Main', items: [] });

    expect(tx.navigation.create).toHaveBeenCalledWith({
      data: { storeId: 'store-1', name: 'Main', items: [] },
    });
  });

  it('update is store-scoped (WHERE id + storeId) so a leaked id cannot cross tenants', async () => {
    (tx.navigation.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    await repository.update(tx as never, 'store-1', 'nav-1', {
      name: 'Footer',
      items: [{ label: 'About', type: 'PAGE', value: 'page-1' }],
    });

    expect(tx.navigation.updateMany).toHaveBeenCalledWith({
      where: { id: 'nav-1', storeId: 'store-1' },
      data: { name: 'Footer', items: [{ label: 'About', type: 'PAGE', value: 'page-1' }] },
    });
  });
});
