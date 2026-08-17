import { Injectable } from '@nestjs/common';
import { Prisma, Shipment, ShipmentStatus, ShippingProvider } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** A shipment row with its append-only status history. */
export type ShipmentWithHistory = Shipment & {
  statusHistory: Array<{
    id: string;
    previousStatus: ShipmentStatus | null;
    newStatus: ShipmentStatus;
    providerStatus: string | null;
    source: string;
    providerEventId: string | null;
    createdAt: Date;
  }>;
};

/** Write input for a new shipment row (provider-agnostic). */
export interface CreateShipmentInput {
  storeId: string;
  orderId: string;
  provider: ShippingProvider;
  codAmount: bigint;
  shippingCost: bigint;
}

/** The update applied by a shipment status transition. */
export interface ShipmentStatusUpdate {
  status: ShipmentStatus;
  providerStatus: string | null;
  rawProviderData?: Prisma.InputJsonValue;
  deliveredAt?: Date | null;
  errorMessage?: string | null;
  /** Exactly-once restock guard (Phase 28 — F-1): set when a terminal failure
   *  state restores the order's stock; the guarded UPDATE makes it idempotent. */
  restockedAt?: Date | null;
}

/**
 * Persistence access for `shipments` + `shipment_status_history` (Phase 27).
 * Encapsulates Prisma access only - no business rules. Every read/write is
 * store-scoped; `UNIQUE (store_id, order_id)` and
 * `UNIQUE (provider, provider_shipment_id)` make shipment creation idempotent.
 */
@Injectable()
export class ShipmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Store-scoped shipment lookup by order (shared client). */
  async findByOrder(storeId: string, orderId: string): Promise<ShipmentWithHistory | null> {
    return this.prisma.shipment.findFirst({
      where: { storeId, orderId },
      include: { statusHistory: { orderBy: { createdAt: 'asc' } } },
    });
  }

  /** Store-scoped shipment lookup by order (inside a transaction). */
  async findByOrderTx(
    tx: Prisma.TransactionClient,
    storeId: string,
    orderId: string,
  ): Promise<ShipmentWithHistory | null> {
    return tx.shipment.findFirst({
      where: { storeId, orderId },
      include: { statusHistory: { orderBy: { createdAt: 'asc' } } },
    });
  }

  /** Store-scoped shipment lookup by id (merchant detail / refresh). */
  async findById(storeId: string, shipmentId: string): Promise<ShipmentWithHistory | null> {
    return this.prisma.shipment.findFirst({
      where: { id: shipmentId, storeId },
      include: { statusHistory: { orderBy: { createdAt: 'asc' } } },
    });
  }

  /** Global provider-id lookup (webhook path) - tenant derived from the row. */
  async findByProviderShipmentId(
    provider: ShippingProvider,
    providerShipmentId: string,
  ): Promise<Shipment | null> {
    return this.prisma.shipment.findFirst({ where: { provider, providerShipmentId } });
  }

  /** Creates a shipment row (DB unique constraints make duplicates impossible). */
  async create(tx: Prisma.TransactionClient, data: CreateShipmentInput): Promise<Shipment> {
    return tx.shipment.create({ data: { ...data } });
  }

  /** Records the initial CREATED history row (source = SYSTEM). */
  async createInitialHistory(
    tx: Prisma.TransactionClient,
    storeId: string,
    shipmentId: string,
  ): Promise<void> {
    await tx.shipmentStatusHistory.create({
      data: {
        storeId,
        shipmentId,
        previousStatus: null,
        newStatus: ShipmentStatus.CREATED,
        providerStatus: null,
        source: 'SYSTEM',
        providerEventId: null,
      },
    });
  }

  /** Guarded status transition + (optionally) delivered_at in one UPDATE. */
  async transitionStatus(
    tx: Prisma.TransactionClient,
    storeId: string,
    shipmentId: string,
    from: ShipmentStatus,
    data: ShipmentStatusUpdate,
  ): Promise<{ count: number }> {
    return tx.shipment.updateMany({
      where: { id: shipmentId, storeId, status: from },
      data: {
        status: data.status,
        ...(data.providerStatus !== null ? { lastProviderStatus: data.providerStatus } : {}),
        ...(data.rawProviderData !== undefined ? { rawProviderData: data.rawProviderData } : {}),
        ...(data.deliveredAt !== undefined
          ? { deliveredAt: data.deliveredAt }
          : data.status === ShipmentStatus.DELIVERED
            ? { deliveredAt: new Date() }
            : {}),
        ...(data.restockedAt !== undefined ? { restockedAt: data.restockedAt } : {}),
        ...(data.errorMessage !== undefined ? { errorMessage: data.errorMessage } : {}),
      },
    });
  }

  /** Records a status history row (source = MERCHANT | WEBHOOK | SYSTEM). */
  async createHistory(
    tx: Prisma.TransactionClient,
    data: {
      storeId: string;
      shipmentId: string;
      previousStatus: ShipmentStatus | null;
      newStatus: ShipmentStatus;
      providerStatus: string | null;
      source: string;
      providerEventId?: string | null;
    },
  ): Promise<void> {
    await tx.shipmentStatusHistory.create({ data: { ...data } });
  }

  /** Safe merchant-facing error message on the shipment row (refresh failure). */
  async setErrorMessage(
    tx: Prisma.TransactionClient,
    storeId: string,
    shipmentId: string,
    errorMessage: string | null,
  ): Promise<void> {
    await tx.shipment.updateMany({
      where: { id: shipmentId, storeId },
      data: { errorMessage },
    });
  }

  /** Updates the persisted provider metadata after a tracking refresh. */
  async applyProviderSnapshot(
    tx: Prisma.TransactionClient,
    storeId: string,
    shipmentId: string,
    data: {
      trackingNumber?: string | null;
      rawProviderData?: Prisma.InputJsonValue;
      lastProviderStatus?: string | null;
      printedLabelUrl?: string | null;
    },
  ): Promise<void> {
    await tx.shipment.updateMany({
      where: { id: shipmentId, storeId },
      data: {
        ...(data.trackingNumber !== undefined ? { trackingNumber: data.trackingNumber } : {}),
        ...(data.lastProviderStatus !== undefined
          ? { lastProviderStatus: data.lastProviderStatus }
          : {}),
        ...(data.rawProviderData !== undefined ? { rawProviderData: data.rawProviderData } : {}),
        ...(data.printedLabelUrl !== undefined ? { printedLabelUrl: data.printedLabelUrl } : {}),
      },
    });
  }
}
