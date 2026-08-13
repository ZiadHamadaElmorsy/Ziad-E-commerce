import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConflictError } from '../../../common/errors/domain-exceptions';
import type { PaymobConfig } from '../../../config/configuration';
import {
  InitiatePaymentInput,
  InitiatedPayment,
  PaymentProvider,
  ProviderWebhookEvent,
} from '../payment-provider';
import { verifyPaymobTransactionHmac } from './paymob-hmac';

/** Default Paymob Accept API base URL (overridable via PAYMOB_API_URL). */
const DEFAULT_PAYMOB_API_URL = 'https://accept.paymob.com';

/** Upper bound for a single Paymob API call (API-SPEC §39 — timeout support). */
const REQUEST_TIMEOUT_MS = 10_000;

interface PaymobAuthTokenResponse {
  token?: string;
}

interface PaymobOrderRegistrationResponse {
  id?: string | number;
}

interface PaymobPaymentKeyResponse {
  token?: string;
}

/**
 * Paymob Accept provider adapter (docs/MVP-SCOPE.md §35, docs/API-SPEC.md §24,
 * docs/DATABASE.md §16.2).
 *
 * Implements the Paymob hosted-checkout flow:
 *   1. auth token      POST /api/auth/tokens            { api_key }
 *   2. order register  POST /api/ecommerce/orders/register
 *   3. payment key     POST /api/acceptance/payment_keys
 *   4. iframe URL      GET  /api/acceptance/iframes/{iframe_id}?payment_token=...
 *
 * - The provider is NEVER coupled to the Order domain: `merchant_order_id` is
 *   set to the globally-unique payment UUID so webhook resolution is
 *   tenant-safe without cross-store scans (OPEN DECISION — see report).
 * - Money stays integer minor units end to end (amount_cents = amount).
 * - Every API call runs OUTSIDE database transactions (DATABASE §28.7) and
 *   enforces a timeout (§39). Credentials come exclusively from the
 *   environment (PAYMOB_*); nothing is hardcoded and nothing sensitive is
 *   logged.
 * - Unconfigured credentials FAIL CLOSED with a safe domain error.
 */
@Injectable()
export class PaymobPaymentProvider implements PaymentProvider {
  private readonly logger = new Logger(PaymobPaymentProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatedPayment> {
    const config = this.configService.get<PaymobConfig>('paymob') ?? {};
    if (!config.apiKey || !config.integrationId || !config.iframeId) {
      this.logger.warn(
        'Paymob is not configured (PAYMOB_API_KEY / PAYMOB_INTEGRATION_ID / PAYMOB_IFRAME_ID missing); failing closed.',
      );
      throw new ConflictError('Payment initiation is not configured.');
    }

    const apiUrl = (config.apiUrl ?? DEFAULT_PAYMOB_API_URL).replace(/\/+$/, '');

    // 1. Authentication token (secret API key -> short-lived token).
    const auth = await this.postJson<PaymobAuthTokenResponse>(`${apiUrl}/api/auth/tokens`, {
      api_key: config.apiKey,
    });
    const authToken = auth.token;
    if (!authToken) {
      throw new ConflictError('Payment initiation failed.');
    }

    // 2. Order registration. merchant_order_id = payment id (globally unique).
    const registered = await this.postJson<PaymobOrderRegistrationResponse>(
      `${apiUrl}/api/ecommerce/orders/register`,
      {
        auth_token: authToken,
        amount_cents: String(input.amount),
        currency: input.currency,
        merchant_order_id: input.paymentId,
        delivery_needed: 'false',
      },
    );
    const orderId = registered.id;
    if (orderId === undefined || orderId === null) {
      throw new ConflictError('Payment initiation failed.');
    }

    // 3. Payment key (binds the order to the merchant integration).
    const keyResult = await this.postJson<PaymobPaymentKeyResponse>(
      `${apiUrl}/api/acceptance/payment_keys`,
      {
        auth_token: authToken,
        amount_cents: String(input.amount),
        currency: input.currency,
        order_id: String(orderId),
        integration_id: config.integrationId,
        billing_data: this.buildBillingData(input),
      },
    );
    const paymentKey = keyResult.token;
    if (!paymentKey) {
      throw new ConflictError('Payment initiation failed.');
    }

    // 4. Hosted checkout URL (iframe) returned to the initiating client.
    const providerCheckoutUrl = `${apiUrl}/api/acceptance/iframes/${config.iframeId}?payment_token=${paymentKey}`;

    return { providerReference: String(orderId), providerCheckoutUrl };
  }

  verifyWebhookSignature(payload: unknown, hmacFromQuery?: string): boolean {
    const config = this.configService.get<PaymobConfig>('paymob') ?? {};
    if (!config.hmacSecret) {
      this.logger.warn(
        'Paymob HMAC secret is not configured (PAYMOB_HMAC_SECRET missing); webhook verification fails closed.',
      );
      return false;
    }

    const body = this.asRecord(payload);
    if (!body) {
      return false;
    }

    const obj = this.asRecord(body.obj ?? (body.data as Record<string, unknown>)?.obj);
    if (!obj) {
      return false;
    }

    const hmac = typeof body.hmac === 'string' ? body.hmac : hmacFromQuery;
    if (!hmac) {
      return false;
    }

    return verifyPaymobTransactionHmac(obj, hmac, config.hmacSecret);
  }

  parseWebhookEvent(payload: unknown): ProviderWebhookEvent | null {
    const body = this.asRecord(payload);
    if (!body) {
      return null;
    }

    const obj = this.asRecord(body.obj ?? (body.data as Record<string, unknown>)?.obj);
    if (!obj) {
      return null;
    }

    const providerEventId = obj.id !== undefined && obj.id !== null ? String(obj.id) : null;
    if (!providerEventId) {
      return null;
    }

    const order = this.asRecord(obj.order);
    const paymentReference =
      order && order.merchant_order_id !== undefined && order.merchant_order_id !== null
        ? String(order.merchant_order_id)
        : null;

    const eventType = typeof body.type === 'string' ? body.type : 'transaction';

    return {
      providerEventId,
      eventType,
      paymentReference,
      success: obj.success === true,
      pending: obj.pending === true,
      failureCode: null,
      failureMessage: this.extractFailureMessage(obj),
    };
  }

  /** Safe provider failure detail (never raw provider internals). */
  private extractFailureMessage(obj: Record<string, unknown>): string | null {
    if (obj.success === true) {
      return null;
    }
    const data = this.asRecord(obj.data);
    if (data && typeof data.message === 'string' && data.message.trim().length > 0) {
      return data.message.slice(0, 500);
    }
    if (typeof obj.error_message === 'string' && obj.error_message.trim().length > 0) {
      return obj.error_message.slice(0, 500);
    }
    return 'Payment was declined.';
  }

  /** Builds the Paymob billing_data payload from the order snapshots. */
  private buildBillingData(input: InitiatePaymentInput): Record<string, string> {
    const b = input.billingData ?? {};
    return {
      first_name: b.firstName ?? '',
      last_name: b.lastName ?? '',
      email: b.email ?? '',
      phone_number: b.phone ?? '',
      apartment: b.apartment ?? '',
      floor: '',
      street: b.addressLine ?? '',
      building: b.building ?? '',
      shipping_method: 'PKG',
      postal_code: '',
      city: b.city ?? '',
      country: 'EG',
      state: b.governorate ?? '',
    };
  }

  private async postJson<T>(url: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        // Log status only — never the body (may contain sensitive data).
        this.logger.warn(`Paymob API request failed with status ${response.status}.`);
        throw new ConflictError('Payment initiation failed.');
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof ConflictError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Paymob API request failed: ${message}`);
      throw new ConflictError('Payment initiation failed.');
    } finally {
      clearTimeout(timer);
    }
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }
}
