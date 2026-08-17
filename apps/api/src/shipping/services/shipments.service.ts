import { Injectable, Logger } from '@nestjs/common';
import {
  OrderPaymentMethod,
  OrderPaymentStatus,
  OrderStatus,
  Prisma,
  Shipment,
  ShipmentStatus,
  ShippingProvider,
} from '@prisma/client';
import { requireStoreId } from '../../catalog/domain/catalog-tenant';
import { RequestContextService } from '../../common/context/request-context.service';
import { ConflictError, NotFoundError } from '../../common/errors/domain-exceptions';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { InventoryReservationService } from '../../inventory/services/inventory-reservation.service';
import { OrderRepository } from '../../orders/repositories/order.repository';
import { OrderWithDetails } from '../../orders/orders.types';
import { transitionTimestamps } from '../../orders/domain/order-lifecycle';
import { assertShipmentTransition, isShipmentTerminal } from '../domain/shipment-status';
import {
  buildCustomerTimeline,
  customerFriendlyStatusKey,
  mapProviderStatusToInternal,
} from '../domain/shipment-status-mapper';
import { ShipmentRepository, ShipmentWithHistory } from '../repositories/shipment.repository';
import {
  CreateShipmentInput,
  ShippingProvider as ShippingProviderContract,
  ShippingWebhookEvent,
} from '../providers/shipping-provider';
import { CustomerTrackingView, ShipmentView, toShipmentView } from '../shipping.types';

/** History source constants for shipment status changes (Part 9). */
export const HISTORY_SOURCE_MERCHANT = 'MERCHANT';
export const HISTORY_SOURCE_WEBHOOK = 'WEBHOOK';
export const HISTORY_SOURCE_SYSTEM = 'SYSTEM';

/** The order statuses that must exist before a shipment may be created. */
const SHIPPABLE_ORDER_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
]);

/**
 * Terminal shipment states that return the goods to the merchant (Phase 28 —
 * F-1). Reaching any of these restores the order's stock exactly once (the
 * `restocked_at` guard claims the restock in the same transaction). REJECTED /
 * DELIVERY_FAILED may still transition to RETURNED; the guard makes the whole
 * sequence idempotent.
 */
const RESTOCK_SHIPMENT_STATUSES: ReadonlySet<ShipmentStatus> = new Set([
  ShipmentStatus.RETURNED,
  ShipmentStatus.REJECTED,
  ShipmentStatus.DELIVERY_FAILED,
]);

/**
 * Shipment application service (Phase 27 - Part 9/10/11).
 * Merchant surface: createShipment / getShipment / refreshTracking /
 * cancelShipment / getLabel. Customer surface: getCustomerTracking (ONE
 * aggregated payload - Part 13/18).
 *
 * - Tenant: every read/write is store-scoped (trusted tenant context or the
 *   storefront resolver - never client input); RLS is the final defense.
 * - Idempotent creation: `UNIQUE (store_id, order_id)` + the service returns
 *   the existing shipment on a repeated "Create Shipment" click (Part 10).
 * - Provider calls happen OUTSIDE the database transaction (DATABASE 28.7).
 * - COD: the shipment's codAmount is the order's grand total; the order stays
 *   UNPAID until the carrier confirms DELIVERED, then it becomes PAID (Part 11).
 */
@Injectable()
export class ShipmentsService {
  private readonly logger = new Logger(ShipmentsService.name);

  constructor(
    private readonly requestContext: RequestContextService,
    private readonly orders: OrderRepository,
    private readonly shipments: ShipmentRepository,
    private readonly provider: ShippingProviderContract,
    private readonly transaction: TransactionService,
    private readonly reservations: InventoryReservationService,
  ) {}

  /**
   * Merchant: creates the shipment for an order (idempotent). Re-running this
   * after a success returns the SAME shipment - it never duplicates.
   */
  async createShipment(orderId: string, storeId?: string): Promise<ShipmentView> {
    const resolvedStoreId = storeId ?? requireStoreId(this.requestContext);
    const order = await this.requireShippableOrder(resolvedStoreId, orderId);

    const existing = await this.shipments.findByOrder(resolvedStoreId, orderId);
    if (existing) {
      return toShipmentView(existing);
    }

    const input = this.buildProviderInput(resolvedStoreId, order);

    // Provider call OUTSIDE the transaction (DATABASE 28.7).
    let created;
    try {
      created = await this.provider.createShipment(input);
    } catch (error) {
      this.logger.warn(
        `shipment creation failed: orderId=${orderId} storeId=${resolvedStoreId} error=${safeMessage(error)}`,
      );
      throw new ConflictError(
        'Shipment creation failed. The delivery company could not be reached.',
      );
    }

    try {
      return await this.transaction.runWithTenant(resolvedStoreId, async (tx) => {
        const shipment = await this.shipments.create(tx, {
          storeId: resolvedStoreId,
          orderId,
          provider: ShippingProvider.BOSTA,
          codAmount: input.codAmount,
          shippingCost: input.shippingCost,
        });
        await this.shipments.createInitialHistory(tx, resolvedStoreId, shipment.id);
        await this.shipments.applyProviderSnapshot(tx, resolvedStoreId, shipment.id, {
          trackingNumber: created.trackingNumber,
          lastProviderStatus: created.rawProviderStatus,
          printedLabelUrl: created.printedLabelUrl,
          rawProviderData: {
            providerShipmentId: created.providerShipmentId,
          } as Prisma.InputJsonValue,
        });
        // The provider id is globally unique; persist it via a direct update.
        await tx.shipment.update({
          where: { id: shipment.id },
          data: { providerShipmentId: created.providerShipmentId },
        });
        const reloaded = await this.shipments.findByOrderTx(tx, resolvedStoreId, orderId);
        if (!reloaded) {
          throw new NotFoundError('The shipment was not found.');
        }
        return toShipmentView(reloaded);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        // A concurrent request already created the shipment - return it.
        const winner = await this.shipments.findByOrder(resolvedStoreId, orderId);
        if (winner) {
          return toShipmentView(winner);
        }
      }
      throw error;
    }
  }

  /** Merchant: shipment detail for the dashboard (404 when none exists). */
  async getShipment(orderId: string, storeId?: string): Promise<ShipmentView> {
    const resolvedStoreId = storeId ?? requireStoreId(this.requestContext);
    const shipment = await this.shipments.findByOrder(resolvedStoreId, orderId);
    if (!shipment) {
      throw new NotFoundError('No shipment exists for this order yet.');
    }
    return toShipmentView(shipment);
  }

  /**
   * Merchant: re-fetches the provider status and applies it (guarded
   * transitions + history + COD payment status when delivered).
   */
  async refreshTracking(orderId: string, storeId?: string): Promise<ShipmentView> {
    const resolvedStoreId = storeId ?? requireStoreId(this.requestContext);
    const order = await this.requireOrder(resolvedStoreId, orderId);
    const shipment = await this.shipments.findByOrder(resolvedStoreId, orderId);
    if (!shipment || !shipment.providerShipmentId) {
      throw new NotFoundError('No shipment exists for this order yet.');
    }

    let snapshot;
    try {
      snapshot = await this.provider.getShipment(shipment.providerShipmentId);
    } catch (error) {
      this.logger.warn(`shipment refresh failed: orderId=${orderId} error=${safeMessage(error)}`);
      throw new ConflictError(
        'Tracking refresh failed. The delivery company could not be reached.',
      );
    }

    const reloaded = await this.applyProviderStatus({
      storeId: resolvedStoreId,
      order,
      shipment,
      providerStatus: snapshot.rawProviderStatus,
      rawData: snapshot.rawData,
      trackingNumber: snapshot.trackingNumber,
      source: HISTORY_SOURCE_MERCHANT,
      providerEventId: null,
    });
    return toShipmentView(reloaded);
  }

  /** Merchant: cancels a shipment (provider + local state, guarded). */
  async cancelShipment(orderId: string, storeId?: string): Promise<ShipmentView> {
    const resolvedStoreId = storeId ?? requireStoreId(this.requestContext);
    await this.requireOrder(resolvedStoreId, orderId);
    const shipment = await this.shipments.findByOrder(resolvedStoreId, orderId);
    if (!shipment) {
      throw new NotFoundError('No shipment exists for this order yet.');
    }
    if (isShipmentTerminal(shipment.status)) {
      throw new ConflictError('This shipment can no longer be cancelled.');
    }

    if (shipment.providerShipmentId) {
      try {
        await this.provider.cancelShipment(shipment.providerShipmentId);
      } catch (error) {
        this.logger.warn(
          `shipment cancellation failed: orderId=${orderId} error=${safeMessage(error)}`,
        );
        throw new ConflictError(
          'Shipment cancellation failed. The delivery company could not be reached.',
        );
      }
    }

    const reloaded = await this.applyInternalTransitionTx(undefined, {
      storeId: resolvedStoreId,
      shipment,
      to: ShipmentStatus.CANCELLED,
      source: HISTORY_SOURCE_MERCHANT,
      providerEventId: null,
    });
    return toShipmentView(reloaded);
  }

  /** Merchant: returns the shipping label URL when the provider supports one. */
  async getLabel(orderId: string, storeId?: string): Promise<{ labelUrl: string } | null> {
    const resolvedStoreId = storeId ?? requireStoreId(this.requestContext);
    const shipment = await this.shipments.findByOrder(resolvedStoreId, orderId);
    if (!shipment || !shipment.providerShipmentId) {
      throw new NotFoundError('No shipment exists for this order yet.');
    }
    try {
      const label = await this.provider.getShippingLabel(shipment.providerShipmentId);
      if (label) {
        await this.transaction.runWithTenant(resolvedStoreId, (tx) =>
          this.shipments.applyProviderSnapshot(tx, resolvedStoreId, shipment.id, {
            printedLabelUrl: label.labelUrl,
          }),
        );
      }
      return label;
    } catch (error) {
      this.logger.warn(`shipment label failed: orderId=${orderId} error=${safeMessage(error)}`);
      throw new ConflictError('The shipping label is not available right now.');
    }
  }

  /**
   * Customer tracking view (Part 13/18) - aggregated order + payment +
   * shipment + timeline in two store-scoped reads. Never exposes provider
   * names, provider ids, raw statuses or internal ids.
   */
  async getCustomerTracking(storeId: string, orderId: string): Promise<CustomerTrackingView> {
    const order = await this.orders.findWithDetails(storeId, orderId);
    if (!order) {
      throw new NotFoundError('The order was not found.');
    }
    const shipment = await this.shipments.findByOrder(storeId, orderId);

    const codAmount =
      order.paymentMethod === OrderPaymentMethod.COD ? Number(order.grandTotal) : 0;
    const status = shipment?.status ?? null;

    const milestones = (shipment?.statusHistory ?? []).map((entry) => ({
      status: entry.newStatus,
      at: entry.createdAt.toISOString(),
    }));

    return {
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        createdAt: order.createdAt.toISOString(),
      },
      payment: {
        method: order.paymentMethod,
        status: order.paymentStatus,
        codAmount,
      },
      tracking: {
        trackingNumber: shipment?.trackingNumber ?? null,
        status: customerFriendlyStatusKey(status),
        timeline: buildCustomerTimeline(status),
        milestones,
        deliveredAt: shipment?.deliveredAt?.toISOString() ?? null,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Webhook-facing internals (used by ShippingWebhookService)
  // ---------------------------------------------------------------------------

  /** Resolves a shipment by its provider event (webhook path). */
  async findByProviderShipmentId(event: ShippingWebhookEvent): Promise<Shipment | null> {
    return this.shipments.findByProviderShipmentId(
      ShippingProvider.BOSTA,
      event.providerShipmentId,
    );
  }

  /** Store-scoped shipment + history lookup (webhook path). */
  async findByOrderTx(storeId: string, orderId: string): Promise<ShipmentWithHistory | null> {
    return this.shipments.findByOrder(storeId, orderId);
  }

  /**
   * Applies a provider status snapshot INSIDE an already-open tenant-bound
   * transaction (webhook path). The caller owns the transaction boundary.
   */
  async applyProviderStatusTx(
    tx: Prisma.TransactionClient,
    input: {
      storeId: string;
      order: OrderWithDetails;
      shipment: ShipmentWithHistory;
      providerStatus: string | null;
      rawData?: unknown;
      source: string;
      providerEventId: string | null;
    },
  ): Promise<ShipmentWithHistory> {
    const internal = mapProviderStatusToInternal(input.providerStatus);
    const rawProviderData = input.rawData as Prisma.InputJsonValue | undefined;

    if (!internal) {
      await this.shipments.applyProviderSnapshot(tx, input.storeId, input.shipment.id, {
        lastProviderStatus: input.providerStatus,
        rawProviderData,
      });
      return input.shipment;
    }

    return this.applyInternalTransitionTx(tx, {
      storeId: input.storeId,
      order: input.order,
      shipment: input.shipment,
      to: internal,
      source: input.source,
      providerEventId: input.providerEventId,
      providerStatus: input.providerStatus,
      rawProviderData,
    });
  }

  // ---------------------------------------------------------------------------
  // Shared internals
  // ---------------------------------------------------------------------------

  /** Store-scoped order load (404 on missing/foreign orders - no existence leak). */
  private async requireOrder(storeId: string, orderId: string): Promise<OrderWithDetails> {
    const order = await this.orders.findWithDetails(storeId, orderId);
    if (!order) {
      throw new NotFoundError('The order was not found.');
    }
    return order;
  }

  /** Store-scoped shippable-order load (rejects cancelled/delivered orders). */
  private async requireShippableOrder(
    storeId: string,
    orderId: string,
  ): Promise<OrderWithDetails> {
    const order = await this.requireOrder(storeId, orderId);
    if (order.status === OrderStatus.CANCELLED) {
      throw new ConflictError('This order was cancelled and cannot be shipped.');
    }
    if (order.status === OrderStatus.DELIVERED) {
      throw new ConflictError('This order has already been delivered.');
    }
    if (!SHIPPABLE_ORDER_STATUSES.has(order.status)) {
      throw new ConflictError('This order must be confirmed before a shipment can be created.');
    }
    return order;
  }

  /** Builds the provider-agnostic create payload from the order aggregate. */
  private buildProviderInput(storeId: string, order: OrderWithDetails): CreateShipmentInput {
    const snapshot =
      order.shippingAddressSnapshot !== null && typeof order.shippingAddressSnapshot === 'object'
        ? (order.shippingAddressSnapshot as Record<string, unknown>)
        : {};
    const items = order.items.map((item) => ({
      name: item.productNameSnapshot,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    }));

    return {
      storeId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      customer: {
        name: order.customerPhone ?? '',
        phone: order.customerPhone,
        email: order.customerEmail,
      },
      address: {
        governorate: asString(snapshot.governorate),
        city: asString(snapshot.city),
        addressLine: asString(snapshot.addressLine),
        building: asString(snapshot.building),
        apartment: asString(snapshot.apartment),
      },
      // COD: the carrier must collect the order grand total (Part 11).
      codAmount: order.paymentMethod === OrderPaymentMethod.COD ? order.grandTotal : 0n,
      shippingCost: order.shippingTotal,
      items,
    };
  }

  /**
   * Merchant tracking-refresh path: applies a provider status snapshot inside a
   * fresh tenant-bound transaction (guarded transitions + history + COD side
   * effects when delivered). Returns the reloaded shipment.
   */
  private async applyProviderStatus(input: {
    storeId: string;
    order: OrderWithDetails;
    shipment: ShipmentWithHistory;
    providerStatus: string | null;
    rawData?: unknown;
    trackingNumber?: string | null;
    source: string;
    providerEventId: string | null;
  }): Promise<ShipmentWithHistory> {
    const internal = mapProviderStatusToInternal(input.providerStatus);
    if (!internal) {
      await this.transaction.runWithTenant(input.storeId, (tx) =>
        this.shipments.applyProviderSnapshot(tx, input.storeId, input.shipment.id, {
          ...(input.trackingNumber !== undefined
            ? { trackingNumber: input.trackingNumber }
            : {}),
          lastProviderStatus: input.providerStatus,
          ...(input.rawData !== undefined
            ? { rawProviderData: input.rawData as Prisma.InputJsonValue }
            : {}),
        }),
      );
      const reloaded = await this.shipments.findByOrder(input.storeId, input.shipment.orderId);
      return reloaded ?? input.shipment;
    }
    return this.applyInternalTransitionTx(undefined, {
      storeId: input.storeId,
      order: input.order,
      shipment: input.shipment,
      to: internal,
      source: input.source,
      providerEventId: input.providerEventId,
      providerStatus: input.providerStatus,
      rawProviderData: input.rawData as Prisma.InputJsonValue | undefined,
      trackingNumber: input.trackingNumber,
    });
  }

  /**
   * Applies an internal shipment status transition + history + order/payment
   * side effects. When `tx` is undefined a fresh tenant-bound transaction is
   * opened (merchant refresh/cancel paths); the webhook path passes its own
   * transaction. No-op when the shipment is already in the target state.
   */
  private async applyInternalTransitionTx(
    tx: Prisma.TransactionClient | undefined,
    input: {
      storeId: string;
      order?: OrderWithDetails;
      shipment: ShipmentWithHistory;
      to: ShipmentStatus;
      source: string;
      providerEventId: string | null;
      providerStatus?: string | null;
      rawProviderData?: Prisma.InputJsonValue;
      trackingNumber?: string | null;
    },
  ): Promise<ShipmentWithHistory> {
    const current = input.shipment.status;
    if (current === input.to) {
      // Idempotent no-op - same internal status, but persist the raw provider
      // metadata so refreshes stay fresh.
      const persist = async (client: Prisma.TransactionClient) =>
        this.shipments.applyProviderSnapshot(client, input.storeId, input.shipment.id, {
          ...(input.trackingNumber !== undefined
            ? { trackingNumber: input.trackingNumber }
            : {}),
          lastProviderStatus: input.providerStatus ?? null,
          ...(input.rawProviderData !== undefined
            ? { rawProviderData: input.rawProviderData }
            : {}),
        });
      if (tx) {
        await persist(tx);
      } else {
        await this.transaction.runWithTenant(input.storeId, persist);
      }
      const reloaded = await this.shipments.findByOrder(input.storeId, input.shipment.orderId);
      return reloaded ?? input.shipment;
    }

    assertShipmentTransition(current, input.to);

    // Phase 28 — F-1: exactly-once restock guard. `restocked_at` is claimed
    // atomically in the SAME guarded UPDATE that wins the status transition, so
    // only the transition winner reaches the restock side effects and a
    // REJECTED -> RETURNED double-fire cannot double-restock.
    const restockNow =
      RESTOCK_SHIPMENT_STATUSES.has(input.to) && input.shipment.restockedAt === null;

    const transition = async (client: Prisma.TransactionClient) => {
      const { count } = await this.shipments.transitionStatus(
        client,
        input.storeId,
        input.shipment.id,
        current,
        {
          status: input.to,
          providerStatus: input.providerStatus ?? null,
          ...(input.rawProviderData !== undefined
            ? { rawProviderData: input.rawProviderData }
            : {}),
          ...(restockNow ? { restockedAt: new Date() } : {}),
        },
      );
      if (count === 0) {
        // A concurrent transition moved the shipment - fail closed.
        throw new ConflictError('The shipment status changed concurrently.');
      }
      await this.shipments.createHistory(client, {
        storeId: input.storeId,
        shipmentId: input.shipment.id,
        previousStatus: current,
        newStatus: input.to,
        providerStatus: input.providerStatus ?? null,
        source: input.source,
        providerEventId: input.providerEventId,
      });

      await this.applyShipmentSideEffects(
        client,
        input.storeId,
        input.shipment.id,
        input.order,
        input.to,
        restockNow,
      );

      const reloaded = await this.shipments.findByOrderTx(
        client,
        input.storeId,
        input.shipment.orderId,
      );
      if (!reloaded) {
        throw new NotFoundError('The shipment was not found.');
      }
      return reloaded;
    };

    return tx ? transition(tx) : this.transaction.runWithTenant(input.storeId, transition);
  }

  /**
   * Shipment side effects (Phase 27 Part 11 + Phase 28 F-1/F-10), executed in
   * the SAME tenant-bound transaction as the guarded status transition:
   *
   * DELIVERED:
   *   - COD order: paymentStatus UNPAID -> PAID (guarded — only once).
   *   - Order lifecycle: SHIPPED -> DELIVERED when the merchant already shipped.
   *
   * Terminal failure states (RETURNED / REJECTED / DELIVERY_FAILED), restock
   * exactly once when the transition claimed `restocked_at`:
   *   - Prepaid order (paymentStatus PAID): on_hand was decremented at payment
   *     consumption, so restore the order's variant stock + write RETURN
   *     movements.
   *   - COD order: on_hand was NEVER decremented (COD reservations are released
   *     by the expiry sweep, never consumed), so only release any still-ACTIVE
   *     reservations (idempotent) — a restock would double-count.
   *
   * RETURNED additionally (runs even when the restock already happened at an
   * earlier REJECTED/DELIVERY_FAILED transition):
   *   - Prepaid order PAID -> REFUNDED (guarded; COD stays UNPAID).
   *   - Order lifecycle CONFIRMED/PROCESSING/SHIPPED -> RETURNED (terminal).
   */
  private async applyShipmentSideEffects(
    tx: Prisma.TransactionClient,
    storeId: string,
    shipmentId: string,
    order: OrderWithDetails | undefined,
    to: ShipmentStatus,
    restockNow: boolean,
  ): Promise<void> {
    if (!order) {
      return;
    }

    if (to === ShipmentStatus.DELIVERED) {
      if (
        order.paymentMethod === OrderPaymentMethod.COD &&
        order.paymentStatus === OrderPaymentStatus.UNPAID
      ) {
        await this.orders.transitionPaymentStatus(
          tx,
          storeId,
          order.id,
          OrderPaymentStatus.UNPAID,
          OrderPaymentStatus.PAID,
        );
      }
      if (order.status === OrderStatus.SHIPPED) {
        await this.orders.transitionStatus(
          tx,
          storeId,
          order.id,
          OrderStatus.SHIPPED,
          OrderStatus.DELIVERED,
          transitionTimestamps(OrderStatus.DELIVERED),
        );
      }
      return;
    }

    if (restockNow && RESTOCK_SHIPMENT_STATUSES.has(to)) {
      if (order.paymentMethod === OrderPaymentMethod.COD) {
        // COD: stock was never consumed — release any ACTIVE reservations
        // (idempotent; already-released reservations skip).
        await this.reservations.releaseAllForOrderTx(tx, storeId, order.id);
      } else {
        // Prepaid: on_hand was decremented at payment consumption — restore it.
        await this.reservations.restockReturnedItemsTx(
          tx,
          storeId,
          order.items,
          { type: 'shipment', id: shipmentId },
        );
      }
    }

    if (to === ShipmentStatus.RETURNED) {
      // Prepaid orders are refunded only when the return is confirmed
      // (guarded PAID -> REFUNDED; a COD order stays UNPAID and is skipped).
      await this.orders.transitionPaymentStatus(
        tx,
        storeId,
        order.id,
        OrderPaymentStatus.PAID,
        OrderPaymentStatus.REFUNDED,
      );
      // The order mirrors the return (guarded, exactly-once, terminal).
      await this.orders.transitionToReturnedTx(tx, storeId, order.id, new Date());
    }
  }
}

/** Safe (non-provider) error message for logs. */
function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** True for a Prisma UNIQUE constraint violation. */
function isUniqueViolation(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
