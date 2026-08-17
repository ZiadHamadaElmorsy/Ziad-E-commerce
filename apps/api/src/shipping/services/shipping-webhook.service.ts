import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  BadRequestError,
  NotFoundError,
  StateTransitionError,
} from '../../common/errors/domain-exceptions';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { OrderRepository } from '../../orders/repositories/order.repository';
import { HISTORY_SOURCE_WEBHOOK, ShipmentsService } from './shipments.service';
import { ShippingProvider } from '../providers/shipping-provider';

export interface ShippingWebhookResult {
  status: 'processed' | 'already_processed' | 'shipment_unresolved';
}

/**
 * Bosta delivery webhook processor (Phase 27 — Part 15).
 *
 * The webhook has NO merchant authentication context: authenticity comes from
 * the provider signature (HMAC over the raw body), the tenant is derived
 * server-side from the resolved shipment's own store (never client input), and
 * processing is idempotent (UNIQUE shipment_id + provider_event_id + guarded
 * status transitions). A forged or cross-tenant event can never update another
 * store's shipment/order.
 *
 *   Verify signature → Find shipment → Validate tenant → Map provider status →
 *   Update shipment → Create status history → Update order/payment when
 *   appropriate (COD becomes PAID only after DELIVERED).
 */
@Injectable()
export class ShippingWebhookService {
  private readonly logger = new Logger(ShippingWebhookService.name);

  constructor(
    private readonly provider: ShippingProvider,
    private readonly orders: OrderRepository,
    private readonly shipments: ShipmentsService,
    private readonly transaction: TransactionService,
  ) {}

  /** POST /webhooks/bosta — verify, resolve, apply, dedup. */
  async processWebhook(rawBody: string, signature?: string): Promise<ShippingWebhookResult> {
    // 1. Verify authenticity. NEVER trust a webhook that merely says delivered.
    if (!this.provider.verifyWebhookSignature(rawBody, signature)) {
      throw new BadRequestError('Invalid delivery webhook signature.');
    }

    // 2. Map to the provider-agnostic event view.
    const event = this.provider.parseWebhookEvent(rawBody);
    if (!event || !event.providerEventId || !event.providerShipmentId) {
      throw new BadRequestError('Unrecognized delivery webhook payload.');
    }

    // 3. Resolve the shipment globally by provider id; the tenant is derived
    //    from the shipment's OWN store_id — a webhook can never pick a tenant.
    const shipment = await this.shipments.findByProviderShipmentId(event);
    if (!shipment) {
      this.logger.warn(
        `bosta webhook unresolved: providerShipmentId=${event.providerShipmentId} status=shipment_unresolved`,
      );
      return { status: 'shipment_unresolved' };
    }

    // 4. Apply the mapped status + history + order/payment side effects in ONE
    //    tenant-bound transaction (guarded; idempotent for duplicates).
    try {
      await this.transaction.runWithTenant(shipment.storeId, async (tx) => {
        const order = await this.orders.findWithDetailsTx(tx, shipment.storeId, shipment.orderId);
        if (!order) {
          throw new NotFoundError('The order was not found.');
        }
        const current = await this.shipments.findByOrderTx(shipment.storeId, shipment.orderId);
        if (!current) {
          throw new NotFoundError('The shipment was not found.');
        }
        await this.shipments.applyProviderStatusTx(tx, {
          storeId: shipment.storeId,
          order,
          shipment: current,
          providerStatus: event.providerStatus,
          rawData: safePayload(rawBody),
          source: HISTORY_SOURCE_WEBHOOK,
          providerEventId: event.providerEventId,
        });
      });
    } catch (error) {
      if (isHistoryDeduplication(error)) {
        // Duplicate delivery of the SAME provider event — safe no-op.
        this.logger.log(
          `bosta webhook duplicate: providerShipmentId=${event.providerShipmentId} providerEventId=${event.providerEventId} status=already_processed`,
        );
        return { status: 'already_processed' };
      }
      if (error instanceof StateTransitionError) {
        // The shipment is already in a terminal state that cannot accept this
        // provider status (e.g. CANCELLED then a late DELIVERED event). The
        // event is safe to acknowledge — the current state stands.
        this.logger.warn(
          `bosta webhook transition skipped: providerShipmentId=${event.providerShipmentId} error=${error.message}`,
        );
        return { status: 'already_processed' };
      }
      throw error;
    }

    this.logger.log(
      `bosta webhook processed: providerShipmentId=${event.providerShipmentId} providerEventId=${event.providerEventId} storeId=${shipment.storeId} status=processed`,
    );
    return { status: 'processed' };
  }
}

/** True when the transaction failed on the shipment+provider_event unique key. */
function isHistoryDeduplication(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    /shipment_status_history/i.test(error.message ?? '')
  );
}

/** The raw payload stored internally on the shipment row (never exposed). */
function safePayload(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody);
  } catch {
    return { raw: rawBody };
  }
}
