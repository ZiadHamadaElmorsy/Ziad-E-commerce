import { VariantStatus } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { ProductVariantRepository } from './product-variant.repository';

describe('ProductVariantRepository', () => {
  let prisma: {
    productVariant: { findUnique: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  };
  let repository: ProductVariantRepository;
  let tx: { productVariant: { create: jest.Mock; update: jest.Mock; updateMany: jest.Mock } };

  beforeEach(() => {
    prisma = {
      productVariant: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    };
    repository = new ProductVariantRepository(prisma as unknown as PrismaService);
    tx = { productVariant: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn() } };
  });

  it('create persists the store-scoped row through the transaction client', async () => {
    (tx.productVariant.create as jest.Mock).mockResolvedValue({ id: 'variant-1' });

    await repository.create(tx as never, {
      storeId: 'store-1',
      productId: 'product-1',
      name: 'Black / Medium',
      price: 500n,
      status: VariantStatus.ACTIVE,
    });

    expect(tx.productVariant.create).toHaveBeenCalledWith({
      data: {
        storeId: 'store-1',
        productId: 'product-1',
        name: 'Black / Medium',
        price: 500n,
        status: VariantStatus.ACTIVE,
      },
    });
  });

  it('update targets the composite store-scoped unique (storeId, id)', async () => {
    (tx.productVariant.update as jest.Mock).mockResolvedValue({ id: 'variant-1' });

    await repository.update(tx as never, 'store-1', 'variant-1', { price: 550n });

    expect(tx.productVariant.update).toHaveBeenCalledWith({
      where: { storeId_id: { storeId: 'store-1', id: 'variant-1' } },
      data: { price: 550n },
    });
  });

  it('updateStatus uses a guarded conditional UPDATE (WHERE status = current)', async () => {
    (tx.productVariant.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    await repository.updateStatus(
      tx as never,
      'store-1',
      'variant-1',
      VariantStatus.ACTIVE,
      VariantStatus.ARCHIVED,
    );

    expect(tx.productVariant.updateMany).toHaveBeenCalledWith({
      where: { id: 'variant-1', storeId: 'store-1', status: VariantStatus.ACTIVE },
      data: { status: VariantStatus.ARCHIVED },
    });
  });

  it('findById uses the composite store-scoped unique (storeId, id)', async () => {
    prisma.productVariant.findUnique.mockResolvedValue({ id: 'variant-1' });

    await repository.findById('store-1', 'variant-1');

    expect(prisma.productVariant.findUnique).toHaveBeenCalledWith({
      where: { storeId_id: { storeId: 'store-1', id: 'variant-1' } },
    });
  });

  it('findByProductId is store-scoped', async () => {
    prisma.productVariant.findMany.mockResolvedValue([]);

    await repository.findByProductId('store-1', 'product-1');

    expect(prisma.productVariant.findMany).toHaveBeenCalledWith({
      where: { storeId: 'store-1', productId: 'product-1' },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('countByProductId is store-scoped', async () => {
    prisma.productVariant.count.mockResolvedValue(1);

    await repository.countByProductId('store-1', 'product-1');

    expect(prisma.productVariant.count).toHaveBeenCalledWith({
      where: { storeId: 'store-1', productId: 'product-1' },
    });
  });
});
