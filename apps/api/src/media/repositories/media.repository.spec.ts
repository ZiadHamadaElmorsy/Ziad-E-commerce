import type { PrismaService } from '../../prisma/prisma.service';
import { MediaRepository } from './media.repository';

describe('MediaRepository', () => {
  let prisma: { media: { findFirst: jest.Mock } };
  let repository: MediaRepository;
  let tx: {
    media: { create: jest.Mock; deleteMany: jest.Mock };
    productMedia: { count: jest.Mock };
  };

  beforeEach(() => {
    prisma = { media: { findFirst: jest.fn() } };
    repository = new MediaRepository(prisma as unknown as PrismaService);
    tx = {
      media: { create: jest.fn(), deleteMany: jest.fn() },
      productMedia: { count: jest.fn() },
    };
  });

  it('create persists the documented media metadata through the transaction client', async () => {
    (tx.media.create as jest.Mock).mockResolvedValue({ id: 'media-1' });

    await repository.create(tx as never, {
      id: 'media-1',
      storeId: 'store-1',
      storagePath: 'store-1/media-1',
      mediaType: 'IMAGE',
      mimeType: 'image/png',
      sizeBytes: 100n,
      altText: null,
    });

    expect(tx.media.create).toHaveBeenCalledWith({
      data: {
        id: 'media-1',
        storeId: 'store-1',
        storagePath: 'store-1/media-1',
        mediaType: 'IMAGE',
        mimeType: 'image/png',
        sizeBytes: 100n,
        altText: null,
      },
    });
  });

  it('findByIdInStore is store-scoped so a leaked id cannot cross tenants', async () => {
    prisma.media.findFirst.mockResolvedValue({ id: 'media-1' });

    await repository.findByIdInStore('store-1', 'media-1');

    expect(prisma.media.findFirst).toHaveBeenCalledWith({
      where: { id: 'media-1', storeId: 'store-1' },
    });
  });

  it('deleteByIdInStore is guarded by storeId (0 rows = absent/cross-tenant)', async () => {
    (tx.media.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

    await repository.deleteByIdInStore(tx as never, 'store-1', 'media-1');

    expect(tx.media.deleteMany).toHaveBeenCalledWith({
      where: { id: 'media-1', storeId: 'store-1' },
    });
  });

  it('countProductMediaReferences is store-scoped (RESTRICT reference guard)', async () => {
    (tx.productMedia.count as jest.Mock).mockResolvedValue(2);

    const count = await repository.countProductMediaReferences(tx as never, 'store-1', 'media-1');

    expect(count).toBe(2);
    expect(tx.productMedia.count).toHaveBeenCalledWith({
      where: { storeId: 'store-1', mediaId: 'media-1' },
    });
  });
});
