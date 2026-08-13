import { CartStatus } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { CartRepository } from './cart.repository';

describe('CartRepository', () => {
  let prisma: { cart: { findFirst: jest.Mock; findMany: jest.Mock } };
  let repository: CartRepository;
  let tx: {
    cart: { findFirst: jest.Mock; create: jest.Mock; updateMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = { cart: { findFirst: jest.fn(), findMany: jest.fn() } };
    repository = new CartRepository(prisma as unknown as PrismaService);
    tx = { cart: { findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn() } };
  });

  it('findByGuestToken is store-scoped (storeId + guest token lookup key)', async () => {
    prisma.cart.findFirst.mockResolvedValue({ id: 'cart-1', storeId: 'store-1' });

    await repository.findByGuestToken('store-1', 'guest-token-1');

    expect(prisma.cart.findFirst).toHaveBeenCalledWith({
      where: { storeId: 'store-1', guestToken: 'guest-token-1' },
    });
  });

  it('findByGuestTokenTx runs the same store-scoped lookup inside the transaction', async () => {
    tx.cart.findFirst.mockResolvedValue({ id: 'cart-1', storeId: 'store-1' });

    await repository.findByGuestTokenTx(tx as never, 'store-1', 'guest-token-1');

    expect(tx.cart.findFirst).toHaveBeenCalledWith({
      where: { storeId: 'store-1', guestToken: 'guest-token-1' },
    });
  });

  it('findById is store-scoped (cart id alone is never trusted)', async () => {
    prisma.cart.findFirst.mockResolvedValue({ id: 'cart-1', storeId: 'store-1' });

    await repository.findById('store-1', 'cart-1');

    expect(prisma.cart.findFirst).toHaveBeenCalledWith({
      where: { id: 'cart-1', storeId: 'store-1' },
    });
  });

  it('create persists storeId + guestToken with ACTIVE status (currency DB default)', async () => {
    tx.cart.create.mockResolvedValue({ id: 'cart-1' });

    await repository.create(tx as never, { storeId: 'store-1', guestToken: 'guest-token-1' });

    expect(tx.cart.create).toHaveBeenCalledWith({
      data: {
        storeId: 'store-1',
        guestToken: 'guest-token-1',
        status: CartStatus.ACTIVE,
      },
    });
  });

  it('transitionStatus is a guarded, store-scoped conditional update', async () => {
    tx.cart.updateMany.mockResolvedValue({ count: 1 });

    const result = await repository.transitionStatus(
      tx as never,
      'store-1',
      'cart-1',
      CartStatus.ACTIVE,
      CartStatus.EXPIRED,
    );

    expect(tx.cart.updateMany).toHaveBeenCalledWith({
      where: { id: 'cart-1', storeId: 'store-1', status: CartStatus.ACTIVE },
      data: { status: CartStatus.EXPIRED },
    });
    expect(result).toEqual({ count: 1 });
  });

  it('findDueForExpiration is store-scoped with a bounded batch ordered by expiry', async () => {
    const now = new Date('2026-08-13T00:00:00Z');
    prisma.cart.findMany.mockResolvedValue([]);

    await repository.findDueForExpiration('store-1', now, 100);

    expect(prisma.cart.findMany).toHaveBeenCalledWith({
      where: { storeId: 'store-1', status: CartStatus.ACTIVE, expiresAt: { lte: now } },
      orderBy: { expiresAt: 'asc' },
      take: 100,
    });
  });
});
