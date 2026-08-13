import type { PrismaService } from '../../prisma/prisma.service';
import { CartItemRepository } from './cart-item.repository';

describe('CartItemRepository', () => {
  let prisma: { cartItem: { findMany: jest.Mock; findFirst: jest.Mock } };
  let repository: CartItemRepository;
  let tx: {
    cartItem: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = { cartItem: { findMany: jest.fn(), findFirst: jest.fn() } };
    repository = new CartItemRepository(prisma as unknown as PrismaService);
    tx = {
      cartItem: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
  });

  it('findManyByCart loads items with their current variant + product (display view)', async () => {
    prisma.cartItem.findMany.mockResolvedValue([]);

    await repository.findManyByCart('cart-1');

    expect(prisma.cartItem.findMany).toHaveBeenCalledWith({
      where: { cartId: 'cart-1' },
      include: { variant: { include: { product: true } } },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('findManyByCartTx runs the same include-read inside the transaction', async () => {
    tx.cartItem.findMany.mockResolvedValue([]);

    await repository.findManyByCartTx(tx as never, 'cart-1');

    expect(tx.cartItem.findMany).toHaveBeenCalledWith({
      where: { cartId: 'cart-1' },
      include: { variant: { include: { product: true } } },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('findById is scoped by cart_id (foreign carts can never match)', async () => {
    prisma.cartItem.findFirst.mockResolvedValue({ id: 'item-1' });

    await repository.findById('cart-1', 'item-1');

    expect(prisma.cartItem.findFirst).toHaveBeenCalledWith({
      where: { id: 'item-1', cartId: 'cart-1' },
    });
  });

  it('findByVariantTx targets the UNIQUE (cart_id, variant_id) line', async () => {
    tx.cartItem.findFirst.mockResolvedValue(null);

    await repository.findByVariantTx(tx as never, 'cart-1', 'variant-1');

    expect(tx.cartItem.findFirst).toHaveBeenCalledWith({
      where: { cartId: 'cart-1', variantId: 'variant-1' },
    });
  });

  it('create persists the cart-scoped line', async () => {
    tx.cartItem.create.mockResolvedValue({ id: 'item-1' });

    await repository.create(tx as never, {
      cartId: 'cart-1',
      variantId: 'variant-1',
      quantity: 2,
    });

    expect(tx.cartItem.create).toHaveBeenCalledWith({
      data: { cartId: 'cart-1', variantId: 'variant-1', quantity: 2 },
    });
  });

  it('updateQuantity is a cart-scoped guarded update', async () => {
    tx.cartItem.updateMany.mockResolvedValue({ count: 1 });

    const result = await repository.updateQuantity(tx as never, 'cart-1', 'item-1', 5);

    expect(tx.cartItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'item-1', cartId: 'cart-1' },
      data: { quantity: 5 },
    });
    expect(result).toEqual({ count: 1 });
  });

  it('delete is a cart-scoped deleteMany', async () => {
    tx.cartItem.deleteMany.mockResolvedValue({ count: 1 });

    const result = await repository.delete(tx as never, 'cart-1', 'item-1');

    expect(tx.cartItem.deleteMany).toHaveBeenCalledWith({
      where: { id: 'item-1', cartId: 'cart-1' },
    });
    expect(result).toEqual({ count: 1 });
  });

  it('deleteManyByCart clears every item of the cart', async () => {
    tx.cartItem.deleteMany.mockResolvedValue({ count: 3 });

    const result = await repository.deleteManyByCart(tx as never, 'cart-1');

    expect(tx.cartItem.deleteMany).toHaveBeenCalledWith({ where: { cartId: 'cart-1' } });
    expect(result).toEqual({ count: 3 });
  });
});
