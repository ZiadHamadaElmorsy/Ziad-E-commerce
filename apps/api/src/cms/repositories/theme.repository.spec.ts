import type { PrismaService } from '../../prisma/prisma.service';
import { ThemeRepository } from './theme.repository';

describe('ThemeRepository', () => {
  let prisma: { themeConfiguration: { findUnique: jest.Mock } };
  let repository: ThemeRepository;
  let tx: {
    themeConfiguration: { findUnique: jest.Mock; create: jest.Mock; updateMany: jest.Mock };
    media: { findFirst: jest.Mock };
  };

  beforeEach(() => {
    prisma = { themeConfiguration: { findUnique: jest.fn() } };
    repository = new ThemeRepository(prisma as unknown as PrismaService);
    tx = {
      themeConfiguration: { findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
      media: { findFirst: jest.fn() },
    };
  });

  it('findByStoreId uses the 1:1 storeId unique', async () => {
    prisma.themeConfiguration.findUnique.mockResolvedValue({ id: 'theme-1' });

    await repository.findByStoreId('store-1');

    expect(prisma.themeConfiguration.findUnique).toHaveBeenCalledWith({
      where: { storeId: 'store-1' },
    });
  });

  it('findByStoreIdTx uses the transaction client', async () => {
    (tx.themeConfiguration.findUnique as jest.Mock).mockResolvedValue({ id: 'theme-1' });

    await repository.findByStoreIdTx(tx as never, 'store-1');

    expect(tx.themeConfiguration.findUnique).toHaveBeenCalledWith({
      where: { storeId: 'store-1' },
    });
  });

  it('create persists the store-scoped default theme through the transaction client', async () => {
    (tx.themeConfiguration.create as jest.Mock).mockResolvedValue({ id: 'theme-1' });

    await repository.create(tx as never, { storeId: 'store-1', config: {} });

    expect(tx.themeConfiguration.create).toHaveBeenCalledWith({
      data: { storeId: 'store-1', config: {} },
    });
  });

  it('update is store-scoped (WHERE id + storeId) so a leaked id cannot cross tenants', async () => {
    (tx.themeConfiguration.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    await repository.update(tx as never, 'store-1', 'theme-1', {
      config: { primaryColor: '#000000' },
      logoMediaId: 'media-1',
    });

    expect(tx.themeConfiguration.updateMany).toHaveBeenCalledWith({
      where: { id: 'theme-1', storeId: 'store-1' },
      data: { config: { primaryColor: '#000000' }, logoMediaId: 'media-1' },
    });
  });

  it('findMediaInStore resolves media only inside the same store', async () => {
    (tx.media.findFirst as jest.Mock).mockResolvedValue({ id: 'media-1' });

    await repository.findMediaInStore(tx as never, 'store-1', 'media-1');

    expect(tx.media.findFirst).toHaveBeenCalledWith({
      where: { id: 'media-1', storeId: 'store-1' },
    });
  });
});
