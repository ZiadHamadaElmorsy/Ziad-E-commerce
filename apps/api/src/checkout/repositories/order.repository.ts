import { Injectable } from '@nestjs/common';
import {
  Order,
  OrderChannel,
  OrderPaymentMethod,
  OrderPaymentStatus,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderWithDetails, OrderWithItems } from '../checkout.types';

/**
 * Minimal Order persistence contract owned by the Checkout phase
 * (docs/DATABASE.md §7.16/§7.17/§15, docs/DOMAIN-MODEL.md §12).
 *
 * This is deliberately NOT the Orders module: there are no order management,
 * listing or lifecycle APIs here. Checkout only needs to (1) create the PENDING
 * order aggregate with its purchase-time snapshot items, and (2) resolve an
 * existing order by its Store-scoped idempotency key so repeated checkout
 * requests return the same result (docs/DATABASE.md §15.7/§27.1).
 *
 * Every read/write is Store-scoped; RLS remains the final defense boundary.
 */
@Injectable()
export class OrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Store-scoped idempotency-key lookup (inside the caller's transaction). */
  async findByStoreAndIdempotencyKeyTx(
    tx: Prisma.TransactionClient,
    storeId: string,
    idempotencyKey: string,
  ): Promise<Order | null> {
    return tx.order.findFirst({ where: { storeId, idempotencyKey } });
  }

  /**
   * Creates the order aggregate atomically: the Order row plus its OrderItem
   * snapshot rows (nested create — docs/DATABASE.md §28.1 step 4). Returns the
   * order with its items so the checkout result is built from the fresh
   * authoritative rows.
   */
  async create(
    tx: Prisma.TransactionClient,
    data: CreateOrderInput,
    items: CreateOrderItemInput[],
  ): Promise<OrderWithItems> {
    return tx.order.create({
      data: { ...data, items: { create: items } },
      include: { items: { orderBy: { createdAt: 'asc' as const } } },
    });
  }

  /** Store-scoped order + items + reservations lookup (shared client). */
  async findByStoreAndIdempotencyKey(
    storeId: string,
    idempotencyKey: string,
  ): Promise<OrderWithDetails | null> {
    return this.prisma.order.findFirst({
      where: { storeId, idempotencyKey },
      include: {
        items: { orderBy: { createdAt: 'asc' as const } },
        reservations: true,
      },
    });
  }

  /** Store-scoped order + items + reservations lookup (inside a transaction). */
  async findWithDetailsTx(
    tx: Prisma.TransactionClient,
    storeId: string,
    orderId: string,
  ): Promise<OrderWithDetails | null> {
    return tx.order.findFirst({
      where: { id: orderId, storeId },
      include: {
        items: { orderBy: { createdAt: 'asc' as const } },
        reservations: true,
      },
    });
  }
}

/** Write input for the Order row (docs/DATABASE.md §7.16). */
export interface CreateOrderInput {
  storeId: string;
  orderNumber: string;
  /** Order acquisition/payment channel (Phase 22 — default ONLINE_PAYMENT). */
  channel: OrderChannel;
  /** How the order's payment is settled (Phase 27 — ONLINE | COD). */
  paymentMethod: OrderPaymentMethod;
  /** Order-level payment status (Phase 27 — COD orders start UNPAID). */
  paymentStatus: OrderPaymentStatus;
  customerId: string | null;
  status: OrderStatus;
  currency: string;
  subtotal: bigint;
  discountTotal: bigint;
  shippingTotal: bigint;
  taxTotal: bigint;
  grandTotal: bigint;
  customerEmail: string | null;
  customerPhone: string | null;
  shippingAddressSnapshot: Prisma.InputJsonValue;
  /** JSONB is nullable — pass Prisma.DbNull for SQL NULL. */
  billingAddressSnapshot: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  idempotencyKey: string | null;
  /** Phase 23 — per-order secure lookup token (see order-lookup-token.ts). */
  lookupToken: string | null;
}

/** Write input for an OrderItem snapshot row (docs/DATABASE.md §7.17). */
export interface CreateOrderItemInput {
  productId: string;
  variantId: string;
  productNameSnapshot: string;
  variantNameSnapshot: string;
  skuSnapshot: string | null;
  unitPrice: bigint;
  quantity: number;
  lineTotal: bigint;
}
