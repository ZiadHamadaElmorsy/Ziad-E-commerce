import { Injectable } from '@nestjs/common';
import { Cart, CartStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Minimal write input for creating a guest Cart (docs/DATABASE.md §7.14). */
export interface CreateCartInput {
  storeId: string;
  guestToken: string;
}

/** A Cart row resolved through its guest identity path (guest_token NOT NULL). */
export type GuestCart = Cart;

/**
 * Persistence access for the `carts` table (docs/DATABASE.md §7.14/§17).
 *
 * Encapsulates Prisma access only — no business rules. Every read is
 * store-scoped (storeId is the trusted tenant id resolved from the membership,
 * never client input) so a Cart operation can never touch another tenant's
 * rows (RLS remains the final defense boundary). The cart is looked up by its
 * opaque guest token — a lookup key only, never an authorization source.
 *
 * The partial UNIQUE (store_id, guest_token) index (migration.sql) guarantees
 * at most one cart per token within a Store, so findFirst == findUnique here.
 */
@Injectable()
export class CartRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Store-scoped guest-cart lookup by token (shared client). */
  async findByGuestToken(storeId: string, guestToken: string): Promise<GuestCart | null> {
    return this.prisma.cart.findFirst({
      where: { storeId, guestToken },
    });
  }

  /** Store-scoped guest-cart lookup by token (inside the caller's transaction). */
  async findByGuestTokenTx(
    tx: Prisma.TransactionClient,
    storeId: string,
    guestToken: string,
  ): Promise<GuestCart | null> {
    return tx.cart.findFirst({
      where: { storeId, guestToken },
    });
  }

  /** Store-scoped cart lookup by id (used to reload the cart for the view). */
  async findById(storeId: string, cartId: string): Promise<Cart | null> {
    return this.prisma.cart.findFirst({ where: { id: cartId, storeId } });
  }

  /**
   * Creates a guest cart. `status` is ACTIVE (schema default) and `currency`
   * defaults to the store currency 'EGP' (docs/DATABASE.md §7.14 — the FINAL
   * documents define no other MVP currency flow).
   */
  async create(tx: Prisma.TransactionClient, data: CreateCartInput): Promise<Cart> {
    return tx.cart.create({
      data: {
        storeId: data.storeId,
        guestToken: data.guestToken,
        status: CartStatus.ACTIVE,
      },
    });
  }

  /**
   * Concurrency-safe lifecycle transition (docs/DATABASE.md §26.2 — guarded
   * UPDATE WHERE status = current). Used by the lazy-expiration evaluation and
   * the expiration sweep. Returns the affected row count; 0 means the row was
   * already transitioned elsewhere (idempotent).
   */
  async transitionStatus(
    tx: Prisma.TransactionClient,
    storeId: string,
    cartId: string,
    from: CartStatus,
    to: CartStatus,
  ): Promise<{ count: number }> {
    return tx.cart.updateMany({
      where: { id: cartId, storeId, status: from },
      data: { status: to },
    });
  }

  /**
   * Concurrency-safe ACTIVE -> COMPLETED transition used by the Checkout phase
   * (docs/DATABASE.md §17.4): a cart fulfilled by a completed checkout is
   * never reused (technical status) and `completed_at` is set at the
   * transition. Returns the affected row count; 0 means the cart was already
   * transitioned elsewhere (e.g. a concurrent checkout won).
   */
  async complete(
    tx: Prisma.TransactionClient,
    storeId: string,
    cartId: string,
  ): Promise<{ count: number }> {
    return tx.cart.updateMany({
      where: { id: cartId, storeId, status: CartStatus.ACTIVE },
      data: { status: CartStatus.COMPLETED, completedAt: new Date() },
    });
  }

  /**
   * Expired ACTIVE carts for the expiration sweep — bounded batch, ordered by
   * expiry, backed by the (store_id, status, expires_at) index
   * (docs/DATABASE.md §11).
   */
  async findDueForExpiration(storeId: string, now: Date, take: number): Promise<Cart[]> {
    return this.prisma.cart.findMany({
      where: { storeId, status: CartStatus.ACTIVE, expiresAt: { lte: now } },
      orderBy: { expiresAt: 'asc' },
      take,
    });
  }
}
