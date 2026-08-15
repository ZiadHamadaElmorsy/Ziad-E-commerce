import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConflictError } from '../../../common/errors/domain-exceptions';
import type { PaymobConfig } from '../../../config/configuration';
import {
  InitiatePaymentInput,
  InitiatedPayment,
  PaymentProvider,
  ProviderWebhookEvent,
} from '../payment-provider';
import { verifyPaymobTransactionHmacDetailed } from './paymob-hmac';

/** Default Paymob Accept API base URL (overridable via PAYMOB_API_URL). */
const DEFAULT_PAYMOB_API_URL = 'https://accept.paymob.com';

/** Upper bound for a single Paymob API call (API-SPEC §39 — timeout support). */
const REQUEST_TIMEOUT_MS = 10_000;

/** Default Intention lifetime in seconds (Paymob `expiration`). */
const DEFAULT_INTENTION_EXPIRES_IN = 600;

/**
 * Legacy Paymob API keys are JWTs (base64url) that start with `eyJ...`. The
 * current Intention API requires the new-format Secret Key (`egy_sk_...`)
 * generated in the Paymob dashboard (Settings → API Keys → Secret Key), sent
 * as an Authorization header — the legacy key only authenticates the legacy
 * endpoints (`/api/auth/tokens`). This pattern detects the legacy JWT shape.
 */
const LEGACY_JWT_KEY_PATTERN = /^(eyJ|ZXlKa)/;

/** The Paymob Intention API response fields the adapter consumes. */
interface PaymobIntentionResponse {
  id?: string | number;
  client_secret?: string;
}

/**
 * Paymob Accept provider adapter (docs/MVP-SCOPE.md §35, docs/API-SPEC.md §24,
 * docs/DATABASE.md §16.2).
 *
 * Phase 22/24 — the provider uses the CURRENT Paymob checkout mechanism:
 * the **Intention API + Unified Checkout** (Option A):
 *
 *   1. intention    POST {apiUrl}/v1/intention
 *                   Authorization: Bearer <secret key>   (PAYMOB_AUTH_SCHEME)
 *                   body: amount, currency, payment_methods (integration id),
 *                         billing_data, items, special_reference (= payment
 *                         UUID), notification_url, redirection_url, expiration
 *   2. checkout     {apiUrl}/unifiedcheckout/?publicKey=...&clientSecret=...
 *
 * Authentication contract (Phase 24 — determined empirically against the
 * merchant's real TEST account): the live endpoint advertises
 * `WWW-Authenticate: Bearer realm=Paymob`, so the provider authenticates with
 * an `Authorization: Bearer <PAYMOB_API_KEY>` header by default. Paymob's
 * published docs list `Authorization: Token <SECRET_KEY>`; the scheme is
 * therefore configurable via `PAYMOB_AUTH_SCHEME` (default `Bearer`) so an
 * account/region using the Token scheme can switch without code changes.
 * IMPORTANT: the value MUST be the new-format Paymob Secret Key
 * (`egy_sk_test_...`/`egy_sk_live_...`); the legacy JWT `PAYMOB_API_KEY`
 * authenticates only the legacy endpoints and the Intention API rejects it
 * with `401 Authentication credentials were not provided.`.
 *
 * This flow avoids the legacy `iframes/{iframe_id}` URL entirely, so
 * `PAYMOB_IFRAME_ID` is NO LONGER REQUIRED (the Paymob dashboard Iframes page
 * is not needed). The legacy auth-token -> order-register -> payment-key ->
 * iframe flow was removed.
 *
 * - The provider is NEVER coupled to the Order domain: `special_reference`
 *   (= `merchant_order_id` in callbacks) is set to the globally-unique
 *   payment UUID so webhook resolution is tenant-safe without cross-store
 *   scans (OPEN DECISION — see report).
 * - Money stays integer minor units end to end (amount = minor units).
 * - The `client_secret` is a session credential: it is embedded ONLY in the
 *   providerCheckoutUrl returned to the initiating client and is never
 *   persisted, logged or exposed through any other field.
 * - Every API call runs OUTSIDE database transactions (DATABASE §28.7) and
 *   enforces a timeout (§39). Credentials come exclusively from the
 *   environment (PAYMOB_*); nothing is hardcoded and nothing sensitive is
 *   logged.
 * - Unconfigured credentials FAIL CLOSED with a safe domain error.
 */
@Injectable()
export class PaymobPaymentProvider implements PaymentProvider, OnModuleInit {
  private readonly logger = new Logger(PaymobPaymentProvider.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Startup diagnostic (Phase 21, updated Phase 22): fails CLEARLY when the
   * Intention-flow credentials are missing by logging exactly which
   * environment variables are unset. `PAYMOB_IFRAME_ID` is intentionally NOT
   * required anymore. The provider still fails closed at call time — this log
   * makes the deployment status visible on boot instead of only at first
   * payment/webhook.
   */
  onModuleInit(): void {
    const config = this.configService.get<PaymobConfig>('paymob') ?? {};
    const missing: string[] = [];
    if (!config.apiKey) missing.push('PAYMOB_API_KEY');
    if (!config.integrationId) missing.push('PAYMOB_INTEGRATION_ID');
    if (!config.publicKey) missing.push('PAYMOB_PUBLIC_KEY');
    if (!config.hmacSecret) missing.push('PAYMOB_HMAC_SECRET');

    if (missing.length > 0) {
      this.logger.warn(
        `Paymob is NOT fully configured. Missing: ${missing.join(', ')}. ` +
          'Payment initiation and webhook verification will FAIL CLOSED until set.',
      );
    } else {
      this.logger.log('Paymob Accept is configured (Intention API + Unified Checkout).');
    }

    // Phase 24 — the Intention API requires the new-format Secret Key
    // (`egy_sk_test_...`), not the legacy JWT api_key.
    if (config.apiKey && LEGACY_JWT_KEY_PATTERN.test(config.apiKey.trim())) {
      this.logger.warn(
        'PAYMOB_API_KEY looks like a LEGACY JWT api key. The Paymob Intention API ' +
          'requires the NEW-format Secret Key (Settings → API Keys → Secret Key, ' +
          'e.g. egy_sk_test_...) sent via the Authorization header. The legacy key ' +
          'only authenticates the legacy /api/auth/tokens endpoint and the Intention ' +
          'API will reject it with 401 until it is replaced.',
      );
    }

    // Phase 23 — advisory: without an explicit public webhook URL Paymob will
    // only reach the callback configured in the Paymob dashboard.
    if (!config.webhookUrl) {
      this.logger.warn(
        'PAYMOB_WEBHOOK_URL is not set. Set the full public webhook URL (e.g. ' +
          'https://api.yourdomain.com/api/v1/webhooks/paymob) or configure it in the Paymob ' +
          'dashboard, or payment callbacks will not reach the API.',
      );
    }
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatedPayment> {
    const config = this.configService.get<PaymobConfig>('paymob') ?? {};
    // Fail closed unless the Intention flow can actually run: the API call
    // needs api_key + integration_id, and the hosted checkout URL needs the
    // (non-secret) public key. iframe_id is never required.
    if (!config.apiKey || !config.integrationId || !config.publicKey) {
      this.logger.warn(
        'Paymob is not configured for the Intention flow ' +
          '(PAYMOB_API_KEY / PAYMOB_INTEGRATION_ID / PAYMOB_PUBLIC_KEY).',
      );
      throw new ConflictError('Payment initiation failed.');
    }

    const apiUrl = (config.apiUrl?.trim() || DEFAULT_PAYMOB_API_URL).replace(/\/+$/, '');

    // 1. Create the payment Intention. Credentials come from the environment;
    //    the secret key travels ONLY in the Authorization header over HTTPS,
    //    and nothing sensitive is logged. `api_key` is NOT part of the
    //    Intention request body (current contract).
    const intention = await this.postJson<PaymobIntentionResponse>(
      `${apiUrl}/v1/intention`,
      {
        amount: Number(input.amount),
        currency: input.currency,
        payment_methods: [Number(config.integrationId)],
        billing_data: this.buildBillingData(input),
        items: [
          {
            name: `Order ${input.orderNumber}`,
            amount: Number(input.amount),
            description: `Order ${input.orderNumber}`,
            quantity: 1,
          },
        ],
        // The payment UUID is echoed back as order.merchant_order_id in every
        // callback, making webhook -> payment resolution tenant-safe.
        special_reference: input.paymentId,
        ...(config.webhookUrl ? { notification_url: config.webhookUrl } : {}),
        ...(input.returnUrl ? { redirection_url: input.returnUrl } : {}),
        expiration: DEFAULT_INTENTION_EXPIRES_IN,
      },
      config,
    );

    if (!intention || typeof intention.client_secret !== 'string' || !intention.client_secret) {
      this.logger.warn('Paymob Intention response did not include a client_secret.');
      throw new ConflictError('Payment initiation failed.');
    }

    const intentionId =
      intention.id !== undefined && intention.id !== null ? String(intention.id) : null;
    const providerReference = intentionId ?? intention.client_secret;

    // 2. The hosted Unified Checkout (no iframe id involved). The
    //    client_secret is only carried inside this URL. The current Paymob
    //    checkout page reads camelCase query parameters.
    const checkoutUrl = `${apiUrl}/unifiedcheckout/?publicKey=${encodeURIComponent(
      config.publicKey,
    )}&clientSecret=${encodeURIComponent(intention.client_secret)}`;

    return { providerReference, providerCheckoutUrl: checkoutUrl };
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

    const verification = verifyPaymobTransactionHmacDetailed(obj, hmac, config.hmacSecret);
    if (!verification.valid) {
      return false;
    }

    // Diagnostic only — never log payload content or the signature.
    if (verification.scheme === 'classic') {
      this.logger.log('Paymob webhook HMAC verified with the CLASSIC (legacy) field list.');
    }
    return true;
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

  private async postJson<T>(url: string, body: unknown, config: PaymobConfig): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Current Intention API contract: the Secret Key authenticates via
          // the Authorization header (server advertises `WWW-Authenticate:
          // Bearer realm=Paymob`). PAYMOB_AUTH_SCHEME switches to `Token` for
          // accounts/regions following the published Token<secret> contract.
          Authorization: `${this.authScheme(config)} ${config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        // Log status only — never the body (may contain sensitive data).
        // A 401 on the Intention API almost always means the configured key is
        // a legacy JWT rather than the new-format secret key.
        if (response.status === 401) {
          this.logger.warn(
            'Paymob Intention API rejected the credentials (401). Set PAYMOB_API_KEY to the ' +
              'NEW-format Paymob Secret Key (Settings → API Keys → Secret Key, e.g. ' +
              'egy_sk_test_...); the legacy JWT api_key is not accepted by the Intention API.',
          );
        } else {
          this.logger.warn(`Paymob API request failed with status ${response.status}.`);
        }
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

  /** The Authorization scheme used for the Intention API (Bearer by default). */
  private authScheme(config: PaymobConfig): 'Bearer' | 'Token' {
    return config.authScheme === 'Token' ? 'Token' : 'Bearer';
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }
}
