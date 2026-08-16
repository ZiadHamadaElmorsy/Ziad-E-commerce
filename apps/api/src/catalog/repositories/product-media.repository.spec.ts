import { ProductMediaRepository } from './product-media.repository';

describe('ProductMediaRepository', () => {
  let repository: ProductMediaRepository;
  let tx: { productMedia: { create: jest.Mock; deleteMany: jest.Mock; aggregate: jest.Mock } };
  let prisma: { productMedia: { findMany: jest.Mock } };

  beforeEach(() => {
    tx = {
      productMedia: {
        create: jest.fn(),
        deleteMany: jest.fn(),
        aggregate: jest.fn(),
      },
    };
    prisma = { productMedia: { findMany: jest.fn() } };
    repository = new ProductMediaRepository(prisma as never);
  });

  it('create persists the store-scoped image link through the transaction client', async () => {
    (tx.productMedia.create as jest.Mock).mockResolvedValue({
      id: 'link-1',
      storeId: 'store-1',
      productId: 'product-1',
      mediaId: 'media-1',
      sortOrder: 0,
    });

    await repository.create(tx as never, {
      storeId: 'store-1',
      productId: 'product-1',
      mediaId: 'media-1',
      sortOrder: 0,
    });

    expect(tx.productMedia.create).toHaveBeenCalledWith({
      data: { storeId: 'store-1', productId: 'product-1', mediaId: 'media-1', sortOrder: 0 },
    });
  });

  it('deleteLink is store-scoped (tenant-safe image removal)', async () => {
    (tx.productMedia.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

    await repository.deleteLink(tx as never, 'store-1', 'product-1', 'media-1');

    expect(tx.productMedia.deleteMany).toHaveBeenCalledWith({
      where: { storeId: 'store-1', productId: 'product-1', mediaId: 'media-1' },
    });
  });

  it('maxSortOrder returns the current highest sort_order (or -1 when empty)', async () => {
    (tx.productMedia.aggregate as jest.Mock).mockResolvedValue({ _max: { sortOrder: 3 } });
    await expect(repository.maxSortOrder(tx as never, 'store-1', 'product-1')).resolves.toBe(3);

    (tx.productMedia.aggregate as jest.Mock).mockResolvedValue({ _max: { sortOrder: null } });
    await expect(repository.maxSortOrder(tx as never, 'store-1', 'product-1')).resolves.toBe(-1);
  });

  it('findImagesByProduct returns the ordered media references of a product', async () => {
    (prisma.productMedia.findMany as jest.Mock).mockResolvedValue([
      { id: 'link-1', media: { id: 'media-1', altText: 'Front' } },
    ]);

    const result = await repository.findImagesByProduct('store-1', 'product-1');

    expect(prisma.productMedia.findMany).toHaveBeenCalledWith({
      where: { storeId: 'store-1', productId: 'product-1' },
      include: { media: { select: { id: true, altText: true } } },
      orderBy: { sortOrder: 'asc' },
    });
    expect(result).toEqual([expect.objectContaining({ media: { id: 'media-1', altText: 'Front' } })]);
  });
});
