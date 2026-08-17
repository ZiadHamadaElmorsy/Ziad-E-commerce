import type { Prisma } from '@prisma/client';

/**
 * Shipping Provider abstraction (Phase 27 — Part 8).
 *
 *   Orders/Shipments domain → ShippingProvider (this interface)
 *                            → Provider adapter → Bosta (and later J&T, …)
 *
 * The shipment/order domain depends ONLY on this interface — never on Bosta
 * internals, credentials or status values. The concrete adapter is bound via
 * dependency injection (ShippingModule). Raw provider statuses travel through
 * `ShipmentStatusSnapshot.rawProviderStatus` and are stored INTERNALLY on the
 * shipment row; the customer never sees them.
 */

/** A merchant-fulfilled order's shipping facts sent to the provider. */
export interface CreateShipmentInput {
  storeId: string;
  orderId: string;
  /** Human-readable order number (e.g. ORD-2026-000001). */
  orderNumber: string;
  customer: {
    name: string;
    phone: string | null;
    email: string | null;
  };
  address: {
    governorate: string | null;
    city: string | null;
    addressLine: string | null;
    building?: string | null;
    apartment?: string | null;
  };
  /** Amount the carrier must collect on delivery — integer minor units (0 = pre-paid). */
  codAmount: bigint;
  /** Shipping cost charged to the order — integer minor units. */
  shippingCost: bigint;
  /** Purchase-time line items (name/quantity/unit price in minor units). */
  items: Array<{ name: string; quantity: number; unitPrice: bigint }>;
}

/** Result of a successful provider shipment creation. */
export interface CreatedShipment {
  /** Provider shipment id (e.g. Bosta `_id`). Stored internally. */
  providerShipmentId: string;
  /** Customer-safe tracking number (the ONLY provider value exposed to customers). */
  trackingNumber: string;
  /** Merchant-facing shipping label URL, when the provider returns one. */
  printedLabelUrl: string | null;
  /** Raw provider status string (stored internally; never exposed to customers). */
  rawProviderStatus: string | null;
}

/** A provider status snapshot (tracking refresh). Raw data is internal only. */
export interface ShipmentStatusSnapshot {
  /** Raw provider status string (e.g. Bosta "OUT_FOR_DELIVERY"). */
  rawProviderStatus: string | null;
  /** Provider tracking number (re-read on refresh). */
  trackingNumber: string | null;
  /** Additional provider fields worth persisting internally (safe subset). */
  rawData: unknown;
}

/** Provider webhook event (already authenticated by the adapter). */
export interface ShippingWebhookEvent {
  /** Provider event/notification id — the dedup key. */
  providerEventId: string;
  /** Provider shipment id the event refers to. */
  providerShipmentId: string;
  /** Raw provider status string (e.g. Bosta "DELIVERED"). */
  providerStatus: string | null;
  /** When the provider reports the event happened (optional). */
  occurredAt?: Date;
}

export abstract class ShippingProvider {
  /**
   * Creates a provider shipment. MUST throw a safe DomainError on failure
   * (never leak provider credentials, raw bodies or stack traces). Never
   * called inside a database transaction.
   */
  abstract createShipment(input: CreateShipmentInput): Promise<CreatedShipment>;

  /** Fetches the current provider status snapshot for a shipment. */
  abstract getShipment(providerShipmentId: string): Promise<ShipmentStatusSnapshot>;

  /** Cancels a provider shipment. Idempotent at the provider when supported. */
  abstract cancelShipment(providerShipmentId: string): Promise<void>;

  /** Returns the merchant shipping label URL when the provider supports labels. */
  abstract getShippingLabel(providerShipmentId: string): Promise<{ labelUrl: string } | null>;

  /**
   * Verifies the authenticity of a provider webhook. MUST fail closed when the
   * provider secret is unconfigured or the signature is missing/invalid — a
   * forged webhook must never mark a shipment delivered or a COD order paid.
   */
  abstract verifyWebhookSignature(rawBody: string, signature?: string): boolean;

  /**
   * Parses a verified provider webhook body into the provider-agnostic event
   * view. Returns null when the payload is not a supported/recognizable event.
   */
  abstract parseWebhookEvent(rawBody: string): ShippingWebhookEvent | null;
}

/** Helper: converts a BigInt minor-units amount to a JSON-safe number. */
export function moneyToNumber(value: bigint): number {
  return Number(value);
}

/** Helper: converts a numeric value (possibly a JSON number) to bigint. */
export function toMinorUnits(value: number | string): bigint {
  return BigInt(Math.round(Number(value)));
}

export type ShipmentCreateJson = Prisma.InputJsonValue;
