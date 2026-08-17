import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConflictError } from '../../../common/errors/domain-exceptions';
import type { BostaConfig } from '../../../config/configuration';
import {
  CreateShipmentInput,
  CreatedShipment,
  ShipmentStatusSnapshot,
  ShippingProvider,
  ShippingWebhookEvent,
} from '../shipping-provider';
import { BOSTA_SIGNATURE_HEADER, verifyBostaWebhookSignature } from './bosta-webhook-signature';

const REQUEST_TIMEOUT_MS = 10_000;
const MIN_COD_MINOR_UNITS = 100n;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstString(...values: Array<unknown>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

/**
 * Bosta shipping provider adapter (Phase 27 - Part 8).
 * Shipments domain to ShippingProvider to BostaShippingProvider to Bosta v2 API.
 * Fail closed; credentials/raw bodies never leak. COD converted from minor
 * units to EGP units at this boundary ONLY.
 */
@Injectable()
export class BostaShippingProvider extends ShippingProvider {
  private readonly logger = new Logger(BostaShippingProvider.name);

  constructor(private readonly config: ConfigService) {
    super();
  }
  override async createShipment(input: CreateShipmentInput): Promise<CreatedShipment> {
    const cfg = this.readConfig();
    const apiKey = cfg.apiKey?.trim();
    if (!apiKey) {
      throw new ConflictError('Shipping is not configured for this store yet.');
    }

    const response = await this.postJson<{ success?: boolean; data?: unknown }>(
      `${cfg.apiUrl}/api/v2/shipments`,
      this.buildCreatePayload(input, cfg),
      apiKey,
    );

    const data = asRecord(response.data);
    const providerShipmentId =
      firstString(data?._id, data?.id, data?.shipmentId) ??
      firstString(data?.waybillNumber, data?.trackingNumber);
    if (!providerShipmentId) {
      this.logger.warn('Bosta create shipment response carried no shipment id.');
      throw new ConflictError('The delivery company did not confirm the shipment.');
    }

    const trackingNumber =
      firstString(data?.trackingNumber, data?.waybillNumber) ?? providerShipmentId;
    const printedLabelUrl = firstString(data?.waybillUrl, data?.labelUrl, data?.label);

    return {
      providerShipmentId,
      trackingNumber,
      printedLabelUrl,
      rawProviderStatus: firstString(data?.status, data?.deliveryStatus),
    };
  }

  override async getShipment(providerShipmentId: string): Promise<ShipmentStatusSnapshot> {
    const cfg = this.readConfig();
    const apiKey = cfg.apiKey?.trim();
    if (!apiKey) {
      throw new ConflictError('Shipping is not configured for this store yet.');
    }

    const response = await this.getJson<{ success?: boolean; data?: unknown }>(
      `${cfg.apiUrl}/api/v2/shipments/${encodeURIComponent(providerShipmentId)}`,
      apiKey,
    );

    const data = asRecord(response.data);
    return {
      rawProviderStatus: firstString(data?.status, data?.deliveryStatus),
      trackingNumber: firstString(data?.trackingNumber, data?.waybillNumber),
      rawData: response.data ?? null,
    };
  }
  override async cancelShipment(providerShipmentId: string): Promise<void> {
    const cfg = this.readConfig();
    const apiKey = cfg.apiKey?.trim();
    if (!apiKey) {
      throw new ConflictError('Shipping is not configured for this store yet.');
    }
    await this.deleteJson<{ success?: boolean }>(
      `${cfg.apiUrl}/api/v2/shipments/${encodeURIComponent(providerShipmentId)}`,
      apiKey,
    );
  }

  override async getShippingLabel(
    providerShipmentId: string,
  ): Promise<{ labelUrl: string } | null> {
    const cfg = this.readConfig();
    const apiKey = cfg.apiKey?.trim();
    if (!apiKey) {
      throw new ConflictError('Shipping is not configured for this store yet.');
    }
    const response = await this.getJson<{ success?: boolean; data?: unknown }>(
      `${cfg.apiUrl}/api/v2/shipments/${encodeURIComponent(providerShipmentId)}/label`,
      apiKey,
    );
    const data = asRecord(response.data);
    const labelUrl = firstString(data?.url, data?.labelUrl, data?.waybillUrl);
    return labelUrl ? { labelUrl } : null;
  }

  override verifyWebhookSignature(rawBody: string, signature?: string): boolean {
    return verifyBostaWebhookSignature(rawBody, signature, this.readConfig().webhookSecret);
  }

  override parseWebhookEvent(rawBody: string): ShippingWebhookEvent | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return null;
    }
    const body = asRecord(parsed);
    if (!body) return null;

    const shipment = asRecord(body.data) ?? asRecord(body.shipment) ?? body;
    const providerShipmentId = firstString(
      shipment?._id,
      shipment?.id,
      body.shipmentId,
      body.businessReference,
    );
    if (!providerShipmentId) return null;

    const providerEventId =
      firstString(body.eventId, body.notificationId, body.id) ??
      `${providerShipmentId}:${firstString(body.event, body.status) ?? 'event'}`;
    const providerStatus = firstString(
      shipment?.status,
      shipment?.deliveryStatus,
      body.event,
      body.status,
    );
    const occurredAt = this.parseDate(body.occurredAt ?? body.createdAt ?? body.timestamp);

    return { providerEventId, providerShipmentId, providerStatus, occurredAt };
  }

  /** Re-exported for the webhook controller (raw-body header name). */
  static readonly signatureHeader = BOSTA_SIGNATURE_HEADER;
  // --- Private helpers --------------------------------------------------------

  private readConfig(): BostaConfig {
    return this.config.get<BostaConfig>('bosta') ?? {};
  }

  private buildCreatePayload(
    input: CreateShipmentInput,
    cfg: BostaConfig,
  ): Record<string, unknown> {
    let codEgUnits: number | undefined;
    if (input.codAmount > 0n) {
      if (input.codAmount < MIN_COD_MINOR_UNITS) {
        throw new ConflictError('The cash-on-delivery amount is too small to ship.');
      }
      codEgUnits = Number(input.codAmount / 100n);
    }

    const [firstName, lastName] = splitCustomerName(input.customer.name);

    return {
      type: 'DELIVERY',
      spec: {
        address: {
          firstLine: input.address.addressLine ?? '',
          secondLine: '',
          city: input.address.city ?? '',
          governorate: input.address.governorate ?? '',
          district: '',
          buildingNumber: input.address.building ?? '',
          floorNumber: '',
          apartmentNumber: input.address.apartment ?? '',
          landmark: '',
        },
      },
      notes: `Order ${input.orderNumber}`,
      ...(codEgUnits !== undefined ? { cod: codEgUnits } : {}),
      ...(cfg.webhookUrl ? { webhookUrl: cfg.webhookUrl } : {}),
      receiver: {
        firstName: firstName ?? '',
        lastName: lastName ?? '',
        phone: input.customer.phone ?? '',
        email: input.customer.email ?? '',
      },
      businessReference: input.orderId,
    };
  }

  private parseDate(value: unknown): Date | undefined {
    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return date;
    }
    return undefined;
  }
  private async postJson<T>(url: string, body: unknown, apiKey: string): Promise<T> {
    return this.fetchJson<T>(url, { method: 'POST', body, apiKey });
  }

  private async getJson<T>(url: string, apiKey: string): Promise<T> {
    return this.fetchJson<T>(url, { method: 'GET', apiKey });
  }

  private async deleteJson<T>(url: string, apiKey: string): Promise<T> {
    return this.fetchJson<T>(url, { method: 'DELETE', apiKey });
  }

  private async fetchJson<T>(
    url: string,
    options: { method: 'GET' | 'POST' | 'DELETE'; body?: unknown; apiKey: string },
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: options.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(`Bosta API request failed with status ${response.status}.`);
        throw new ConflictError('The delivery company could not be reached. Please try again.');
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof ConflictError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Bosta API request failed: ${message}`);
      throw new ConflictError('The delivery company could not be reached. Please try again.');
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Splits a full customer name into first/last name (Bosta receiver contract). */
function splitCustomerName(name: string): [string | null, string | null] {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return [null, null];
  if (parts.length === 1) return [parts[0], null];
  return [parts[0], parts.slice(1).join(' ')];
}
