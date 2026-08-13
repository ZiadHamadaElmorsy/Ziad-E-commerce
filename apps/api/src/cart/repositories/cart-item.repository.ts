import { Injectable } from '@nestjs/common';
import { CartItem, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CartItemWithVariant } from '../cart.types';

/** Minimal write input for creating a CartItem (docs/DATABASE.md §7.15). */
export interface CreateCartItemInput {
  cartId: string;
  variantId: string;
  quantity: number;
}

/**
 * Persistence access for the `cart_items` table (docs/DATABASE.md §7.15).
 *
 * The table has NO store_id column — ownership is inherited through the cart,
 * so every operation is scoped by cart_id and the caller ALWAYS resolves the
 * owning cart inside the trusted tenant store first (RLS resolves the Store
 * through the parent cart — docs/DATABASE.md §29.4). Encapsulates Prisma only;
 * no business rules.
 */
@Injectable()
export class CartItemRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** All items of a cart with their current variant + product (GET view). */
  async findManyByCart(cartId: string): Promise<CartItemWithVariant[]> {
    return this.prisma.cartItem.findMany({
      where: { cartId },
      include: { variant: { include: { product: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Same read inside the caller's transaction (used after a mutation). */
  async findManyByCartTx(
    tx: Prisma.TransactionClient,
    cartId: string,
  ): Promise<CartItemWithVariant[]> {
    return tx.cartItem.findMany({
      where: { cartId },
      include: { variant: { include: { product: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** An item of a cart (scoped by cart_id so foreign carts can never match). */
  async findById(cartId: string, itemId: string): Promise<CartItem | null> {
    return this.prisma.cartItem.findFirst({ where: { id: itemId, cartId } });
  }

  /** The line for a variant in a cart — UNIQUE (cart_id, variant_id) = at most one. */
  async findByVariantTx(
    tx: Prisma.TransactionClient,
    cartId: string,
    variantId: string,
  ): Promise<CartItem | null> {
    return tx.cartItem.findFirst({ where: { cartId, variantId } });
  }

  async create(tx: Prisma.TransactionClient, data: CreateCartItemInput): Promise<CartItem> {
    return tx.cartItem.create({ data: { ...data } });
  }

  /** Replaces the line quantity (the documented add-merges-quantity path). */
  async updateQuantity(
    tx: Prisma.TransactionClient,
    cartId: string,
    itemId: string,
    quantity: number,
  ): Promise<{ count: number }> {
    return tx.cartItem.updateMany({
      where: { id: itemId, cartId },
      data: { quantity },
    });
  }

  async delete(
    tx: Prisma.TransactionClient,
    cartId: string,
    itemId: string,
  ): Promise<{ count: number }> {
    return tx.cartItem.deleteMany({ where: { id: itemId, cartId } });
  }

  /** Removes every item of a cart (DELETE /cart/items — clear cart). */
  async deleteManyByCart(tx: Prisma.TransactionClient, cartId: string): Promise<{ count: number }> {
    return tx.cartItem.deleteMany({ where: { cartId } });
  }
}
