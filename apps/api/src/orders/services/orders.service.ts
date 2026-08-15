import { Injectable } from '@nestjs/common';
import { Order, OrderChannel, OrderStatus, Prisma } from '@prisma/client';
import { requireStoreId } from '../../catalog/domain/catalog-tenant';
import { buildPaginationMeta } from '../../catalog/catalog.types';
import { RequestContextService } from '../../common/context/request-context.service';
import { NotFoundError, StateTransitionError } from '../../common/errors/domain-exceptions';
import { UserRepository } from '../../identity/repositories/user.repository';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { InventoryReservationService } from '../../inventory/services/inventory-reservation.service';
import { assertOrderTransition, transitionTimestamps } from '../domain/order-lifecycle';
import { mapOrderWriteError } from '../domain/order-error.mapper';
import { ListOrdersQueryDto } from '../dto/list-orders-query.dto';
import { UpdateOrderStatusDto } from '../dto/update-order-status.dto';
import { AuditLogRepository } from '../repositories/audit-log.repository';
import { OrderListFilter, OrderRepository } from '../repositories/order.repository';
import {
  OrderSummaryView,
  OrderView,
  PaginatedView,
  toOrderSummaryView,
  toOrderView,
} from '../orders.types';

/** Audit action for order status changes (DATABASE §7.18 example: order.cancelled). */
const AUDIT_ACTION_ORDER_CANCELLED = 'order.cancelled';
/** Non-cancellation status-change action following the entity.action convention. */
const AUDIT_ACTION_ORDER_STATUS_CHANGED = 'order.status_changed';

/**
 * Order application service (docs/API-SPEC.md §23, docs/DOMAIN-MODEL.md §12,
 * docs/DATABASE.md §15/§28.4).
 *
 * Business rules implemented here:
 *
 * - Order ownership is ALWAYS the trusted tenant context (membership ->
 *   store); client-supplied ids are never an authorization source. Every
 *   repository query is store-scoped and RLS is the final defense. Missing or
 *   foreign orders fail closed with NOT_FOUND (no cross-tenant existence
 *   leak).
 * - Order reads are built EXCLUSIVELY from the purchase-time snapshots
 *   (DATABASE §15.3) — current Product/Variant/Customer rows never substitute
 *   historical values.
 * - Status updates follow the exact documented lifecycle (DOMAIN-MODEL §12.3,
 *   DATABASE §15.2). Illegal transitions fail with STATE_TRANSITION (409)
 *   BEFORE any write.
 * - The transition is a guarded conditional UPDATE (DATABASE §26.2/§28.4): if
 *   a concurrent operation already moved the order, the update affects zero
 *   rows and the request fails closed with STATE_TRANSITION.
 * - Cancellation (PENDING | CONFIRMED -> CANCELLED) additionally releases the
 *   order's ACTIVE inventory reservations and writes the audit_logs row in the
 *   SAME tenant-bound transaction (DATABASE §28.4). Every successful status
 *   change is audited (US-ORDER-003 "Changes are audited"; DATABASE §7.18).
 * - Order CREATION is owned by the Checkout phase; this module never creates
 *   orders, order items, order numbers or reservations.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly orders: OrderRepository,
    private readonly audit: AuditLogRepository,
    private readonly users: UserRepository,
    private readonly reservations: InventoryReservationService,
    private readonly transaction: TransactionService,
  ) {}

  /** GET /api/v1/orders — store-scoped, documented filters only. */
  async list(query: ListOrdersQueryDto): Promise<PaginatedView<OrderSummaryView>> {
    const storeId = requireStoreId(this.requestContext);
    const skip = (query.page - 1) * query.limit;

    const filter: OrderListFilter = {
      status: query.status,
      search: query.search,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
      skip,
      take: query.limit,
      orderBy: { createdAt: 'desc' },
    };

    const [items, total] = await Promise.all([
      this.orders.findMany(storeId, filter),
      this.orders.count(storeId, filter),
    ]);

    return {
      items: items.map(toOrderSummaryView),
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  /** GET /api/v1/orders/:orderId — full detail from purchase-time snapshots. */
  async get(orderId: string): Promise<OrderView> {
    const storeId = requireStoreId(this.requestContext);

    const order = await this.orders.findWithDetails(storeId, orderId);
    if (!order) {
      throw new NotFoundError('The order was not found.');
    }
    return toOrderView(order);
  }

  /**
   * PATCH /api/v1/orders/:orderId/status — validate the documented lifecycle
   * transition, then apply it with a concurrency-safe guarded UPDATE inside a
   * tenant-bound transaction (reservations + audit for cancellation, §28.4).
   */
  async updateStatus(orderId: string, dto: UpdateOrderStatusDto): Promise<OrderView> {
    const storeId = requireStoreId(this.requestContext);

    // Load the current order (store-scoped). Missing/foreign -> NOT_FOUND
    // (no existence leak).
    const order = await this.orders.findWithDetails(storeId, orderId);
    if (!order) {
      throw new NotFoundError('The order was not found.');
    }

    // Validate the documented lifecycle transition BEFORE any write.
    assertOrderTransition(order.status, dto.status);

    const actorAuthUserId = this.requestContext.getCurrent()?.user?.authUserId;

    try {
      const updated = await this.transaction.runWithTenant(storeId, async (tx) => {
        const { count } = await this.orders.transitionStatus(
          tx,
          storeId,
          orderId,
          order.status,
          dto.status,
          transitionTimestamps(dto.status),
        );
        if (count === 0) {
          // A concurrent operation already changed the order — fail closed
          // (guarded conditional UPDATE semantics, DATABASE §26.2/§28.4).
          throw new StateTransitionError(
            `The order status changed concurrently; the ${order.status} -> ${dto.status} transition was not applied.`,
          );
        }

        if (dto.status === OrderStatus.CANCELLED) {
          // DATABASE §28.4: order CANCELLED -> release ACTIVE reservations
          // -> audit, ONE transaction. Reservation release is idempotent
          // (guarded ACTIVE -> RELEASED), so a concurrent release race is
          // safe; CONSUMED/RELEASED reservations are skipped.
          await this.reservations.releaseAllForOrderTx(tx, storeId, orderId);
        }

        // Phase 22 — WhatsApp orders have NO payment webhook to consume their
        // reservations (the customer pays the merchant manually). The
        // merchant's manual confirmation (PENDING -> CONFIRMED) is the
        // commitment point: consume the ACTIVE reservations in the SAME
        // transaction so a confirmed order never loses its stock to the Phase
        // 21 expiry sweep. Consumption is idempotent (guarded
        // ACTIVE -> CONSUMED); ONLINE_PAYMENT orders keep their existing
        // webhook-driven consumption.
        if (dto.status === OrderStatus.CONFIRMED && order.channel === OrderChannel.WHATSAPP) {
          await this.reservations.consumeAllForOrderTx(tx, storeId, orderId);
        }

        await this.writeAudit(tx, storeId, order, dto.status, actorAuthUserId);

        const reloaded = await this.orders.findWithDetailsTx(tx, storeId, orderId);
        if (!reloaded) {
          throw new NotFoundError('The order was not found.');
        }
        return reloaded;
      });

      return toOrderView(updated);
    } catch (error) {
      throw mapOrderWriteError(error);
    }
  }

  /**
   * Audit record for a successful order status change (US-ORDER-003,
   * DATABASE §7.18/§28.4). The actor is the authenticated merchant resolved
   * to the application users.id; it is stored as NULL when the actor cannot
   * be resolved (the column is nullable — DATABASE §7.18).
   */
  private async writeAudit(
    tx: Prisma.TransactionClient,
    storeId: string,
    order: Order,
    to: OrderStatus,
    actorAuthUserId: string | undefined,
  ): Promise<void> {
    const actor = actorAuthUserId ? await this.users.findByAuthUserIdTx(tx, actorAuthUserId) : null;

    await this.audit.create(tx, {
      storeId,
      userId: actor?.id ?? null,
      action:
        to === OrderStatus.CANCELLED
          ? AUDIT_ACTION_ORDER_CANCELLED
          : AUDIT_ACTION_ORDER_STATUS_CHANGED,
      entityType: 'order',
      entityId: order.id,
      metadata: { orderNumber: order.orderNumber, from: order.status, to },
    });
  }
}
