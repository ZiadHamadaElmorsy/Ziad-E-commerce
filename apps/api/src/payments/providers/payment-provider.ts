/**
 * Payment Provider abstraction (docs/DOMAIN-MODEL.md §28 #8,
 * docs/DATABASE.md §16.2):
 *
 *   Order domain -> Payment domain -> PaymentProvider interface
 *                                   -> Provider adapter -> Paymob
 *
 * The application/domain layer depends ONLY on this interface — never on
 * Paymob internals. Future providers (Fawry, COD, Stripe) plug into the same
 * interface without redesigning orders/payments. The concrete adapter is
 * bound via dependency injection (PaymentsModule).
 */

/** Customer billing contact used to build provider checkout sessions. */
export interface InitiatePaymentBillingData {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  governorate?: string;
  city?: string;
  addressLine?: string;
  building?: string;
  apartment?: string;
}

export interface InitiatePaymentInput {
  /** Payment record id — used as the provider-side merchant reference. */
  paymentId: string;
  orderId: string;
  /** Human-readable order number (e.g. ORD-2026-000001). */
  orderNumber: string;
  /** Amount in integer minor units (EGP piastres) — NEVER a float. */
  amount: bigint;
  /** ISO 4217 currency (the order's authoritative currency). */
  currency: string;
  billingData?: InitiatePaymentBillingData;
  /**
   * Customer-facing return URL (Paymob `redirect_url`) — where Paymob sends
   * the browser after the payment attempt. Optional; the webhook remains the
   * authoritative confirmation (DATABASE §16.5/§16.6).
   */
  returnUrl?: string;
}

/** Result of a successful provider initiation (payment session created). */
export interface InitiatedPayment {
  /** Provider payment/transaction/order reference persisted on payment + attempt. */
  providerReference: string;
  /** Provider-hosted checkout URL the storefront renders (Paymob iframe). */
  providerCheckoutUrl: string;
}

/**
 * Provider-agnostic webhook event (already authenticated by the provider
 * adapter). The webhook layer consumes ONLY this mapped view — raw provider
 * payloads stay inside payment_events.payload and adapter mapping
 * (DATABASE §16.2).
 */
export interface ProviderWebhookEvent {
  /** Provider event/transaction id — the dedup key (UNIQUE provider+event_id). */
  providerEventId: string;
  /** Provider event type, e.g. Paymob "transaction". */
  eventType: string;
  /**
   * Reference that maps the event back to OUR payment (Paymob
   * merchant_order_id). NULL when the payload carries no resolvable reference.
   */
  paymentReference: string | null;
  /** Whether the provider reports the payment as successful. */
  success: boolean;
  /** Whether the provider reports the transaction as still pending. */
  pending: boolean;
  failureCode: string | null;
  failureMessage: string | null;
}

export abstract class PaymentProvider {
  /**
   * Creates a provider payment session (auth -> order registration -> payment
   * key / hosted checkout). MUST throw a safe DomainError on failure (never
   * leak provider credentials or stack traces). Never called inside a
   * database transaction (DATABASE §28.7).
   */
  abstract initiatePayment(input: InitiatePaymentInput): Promise<InitiatedPayment>;

  /**
   * Verifies the authenticity of a provider webhook. MUST fail closed when the
   * provider secret is unconfigured or the signature is missing/invalid. A
   * forged webhook must never confirm an order, consume inventory or alter
   * payment state.
   */
  abstract verifyWebhookSignature(payload: unknown, hmacFromQuery?: string): boolean;

  /**
   * Maps a verified provider payload into the provider-agnostic event view.
   * Returns null when the payload is not a supported/recognizable event.
   */
  abstract parseWebhookEvent(payload: unknown): ProviderWebhookEvent | null;
}
