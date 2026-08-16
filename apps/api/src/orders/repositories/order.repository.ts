import { Injectable } from '@nestjs/common';
import { Order, OrderChannel, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderWithDetails } from '../orders.types';

/** Store-scoped list filter for the order collection endpoint (API-SPEC §23). */
export interface OrderListFilter {
  status?: OrderStatus;
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
  skip: number;
  take: number;
  orderBy: Prisma.OrderOrderByWithRelationInput;
}

/**
 * Persistence access for the `orders` table owned by the Orders phase
 * (docs/DATABASE.md §7.16/§7.17/§15).
 *
 * This is the management-side contract of the Orders module: store-scoped
 * reads (detail + collection), the collection count, and the concurrency-safe
 * guarded lifecycle transition. Order CREATION remains owned by the Checkout
 * phase (CheckoutModule's OrderRepository) — the Orders module consumes and
 * manages those records and never duplicates creation.
 *
 * Every read/write is store-scoped (storeId is the trusted tenant id resolved
 * from the membership, never client input); RLS remains the final defense
 * boundary.
 */
@Injectable()
export class OrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Store-scoped order + snapshot items + reservations (shared client). */
  async findWithDetails(storeId: string, orderId: string): Promise<OrderWithDetails | null> {
    return this.prisma.order.findFirst({
      where: { id: orderId, storeId },
      include: {
        items: { orderBy: { createdAt: 'asc' as const } },
        reservations: true,
      },
    });
  }

  /** Store-scoped order + snapshot items + reservations (inside a transaction). */
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

  /** Store-scoped collection read (backed by the orders listing indexes, DATABASE §11). */
  async findMany(storeId: string, filter: OrderListFilter): Promise<Order[]> {
    return this.prisma.order.findMany({
      where: this.buildWhere(storeId, filter),
      skip: filter.skip,
      take: filter.take,
      orderBy: filter.orderBy,
    });
  }

  /** Store-scoped collection count with the same filter. */
  async count(storeId: string, filter: OrderListFilter): Promise<number> {
    return this.prisma.order.count({ where: this.buildWhere(storeId, filter) });
  }

  /**
   * Store-scoped SUM of grand_total across ALL orders (Phase 25 — dashboard
   * stats). One aggregate query replaces the browser-side paginated sum loop
   * (which made up to 50 sequential API requests for a 5,000-order store).
   */
  async sumGrandTotal(storeId: string): Promise<bigint | null> {
    const result = await this.prisma.order.aggregate({
      where: { storeId },
      _sum: { grandTotal: true },
    });
    return result._sum.grandTotal;
  }

  /**
   * Concurrency-safe lifecycle transition (docs/DATABASE.md §26.2/§28.4 —
   * guarded conditional UPDATE WHERE status = from). Only when the UPDATE
   * affects exactly one row is the transition applied; 0 means a concurrent
   * operation already moved the order (the caller fails closed with
   * STATE_TRANSITION). `confirmed_at`/`cancelled_at` are written at the
   * documented transitions (DATABASE §7.16).
   */
  async transitionStatus(
    tx: Prisma.TransactionClient,
    storeId: string,
    orderId: string,
    from: OrderStatus,
    to: OrderStatus,
    timestamps: { confirmedAt?: Date; cancelledAt?: Date },
  ): Promise<{ count: number }> {
    return tx.order.updateMany({
      where: { id: orderId, storeId, status: from },
      data: {
        status: to,
        ...(timestamps.confirmedAt ? { confirmedAt: timestamps.confirmedAt } : {}),
        ...(timestamps.cancelledAt ? { cancelledAt: timestamps.cancelledAt } : {}),
      },
    });
  }

  /**
   * Store-scoped channel update (Phase 22). Used ONLY by the WhatsApp order
   * flow to transition an existing PENDING order to the WHATSAPP channel when
   * the customer chooses WhatsApp instead of the failed online payment. The
   * guarded conditional UPDATE keeps concurrent status changes safe.
   */
  async transitionChannel(
    tx: Prisma.TransactionClient,
    storeId: string,
    orderId: string,
    from: OrderChannel,
    to: OrderChannel,
  ): Promise<{ count: number }> {
    return tx.order.updateMany({
      where: { id: orderId, storeId, channel: from },
      data: { channel: to },
    });
  }

  private buildWhere(storeId: string, filter: OrderListFilter): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = { storeId };

    if (filter.status) {
      where.status = filter.status;
    }

    if (filter.search) {
      // The FINAL documents do not define the searched fields; the minimal
      // interpretation is the order's identifying snapshot fields
      // (order_number / customer_email / customer_phone), case-insensitively.
      where.OR = [
        { orderNumber: { contains: filter.search, mode: 'insensitive' } },
        { customerEmail: { contains: filter.search, mode: 'insensitive' } },
        { customerPhone: { contains: filter.search, mode: 'insensitive' } },
      ];
    }

    if (filter.dateFrom || filter.dateTo) {
      where.createdAt = {
        ...(filter.dateFrom ? { gte: filter.dateFrom } : {}),
        ...(filter.dateTo ? { lte: filter.dateTo } : {}),
      };
    }

    return where;
  }
}
