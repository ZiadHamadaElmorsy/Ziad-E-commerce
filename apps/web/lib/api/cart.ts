import { appConfig } from '@/lib/config';
import { ApiError } from './client';
import type {
  CartView,
  CheckoutInput,
  CheckoutResult,
  CustomerTrackingView,
  Envelope,
  PaymentView,
  StorefrontOrderView,
  WhatsAppOrderResult,
} from '@/lib/storefront/types';

/**
 * Public storefront commerce API (Phase 19) — guest cart / checkout / payment /
 * order confirmation.
 *
 * These calls are ANONYMOUS (no merchant session — customers never create
 * merchant accounts). The backend resolves the store SERVER-SIDE via the
 * existing StorefrontStoreResolver (`X-Storefront-Slug` header). The opaque
 * `X-Guest-Token` header only selects a cart INSIDE that resolved store, and
 * the `Idempotency-Key` header makes checkout / payment initiation safe to
 * retry (docs/API-SPEC.md §13/§22/§24).
 *
 * No payment card data is ever collected or stored in this application; the
 * customer pays on the Paymob-hosted checkout (providerCheckoutUrl).
 */

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface CommerceRequestOptions {
  method: HttpMethod;
  body?: unknown;
  guestToken?: string;
  idempotencyKey?: string;
}

async function commerceRequest<T>(slug: string, path: string, options: CommerceRequestOptions): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Storefront-Slug': slug,
  };
  if (options.guestToken) {
    headers['X-Guest-Token'] = options.guestToken;
  }
  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }

  const response = await fetch(`${appConfig.apiUrl}${path}`, {
    method: options.method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    throw await parseCommerceError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const envelope = (await response.json()) as Envelope<T>;
  return envelope.data;
}

async function parseCommerceError(response: Response): Promise<ApiError> {
  let envelope: { error?: { code?: string; message?: string; details?: unknown } } = {};
  try {
    envelope = (await response.json()) as typeof envelope;
  } catch {
    // Non-JSON error body.
  }
  return new ApiError(envelope.error?.message ?? `Request failed (${response.status}).`, {
    code: envelope.error?.code ?? 'REQUEST_FAILED',
    status: response.status,
    details: envelope.error?.details,
  });
}

/** Generates a fresh RFC-4122 idempotency key (checkout / payment initiation). */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// --- Cart --------------------------------------------------------------------

export async function getStorefrontCart(slug: string, guestToken: string): Promise<CartView> {
  return commerceRequest<CartView>(slug, '/storefront/cart', { method: 'GET', guestToken });
}

export async function addStorefrontCartItem(
  slug: string,
  guestToken: string | undefined,
  input: { variantId: string; quantity: number },
): Promise<CartView> {
  return commerceRequest<CartView>(slug, '/storefront/cart/items', {
    method: 'POST',
    body: input,
    guestToken,
  });
}

export async function updateStorefrontCartItem(
  slug: string,
  guestToken: string,
  itemId: string,
  quantity: number,
): Promise<CartView> {
  return commerceRequest<CartView>(slug, `/storefront/cart/items/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    body: { quantity },
    guestToken,
  });
}

export async function removeStorefrontCartItem(
  slug: string,
  guestToken: string,
  itemId: string,
): Promise<void> {
  await commerceRequest<void>(slug, `/storefront/cart/items/${encodeURIComponent(itemId)}`, {
    method: 'DELETE',
    guestToken,
  });
}

export async function clearStorefrontCart(slug: string, guestToken: string): Promise<void> {
  await commerceRequest<void>(slug, '/storefront/cart/items', { method: 'DELETE', guestToken });
}

// --- Checkout / Payment / Order -------------------------------------------------

export async function checkoutStorefront(
  slug: string,
  guestToken: string,
  input: CheckoutInput,
  idempotencyKey: string,
): Promise<CheckoutResult> {
  return commerceRequest<CheckoutResult>(slug, '/storefront/checkout', {
    method: 'POST',
    body: input,
    guestToken,
    idempotencyKey,
  });
}
export interface WhatsAppOrderInput extends CheckoutInput {
  orderId?: string;
  lang?: 'en' | 'ar';
}

/**
 * POST /storefront/orders/whatsapp (Phase 22) — creates (or reuses) a real
 * WhatsApp order through the existing checkout pipeline and returns the wa.me
 * deep link. Idempotent via the Idempotency-Key header.
 */
export async function orderViaWhatsApp(
  slug: string,
  guestToken: string,
  input: WhatsAppOrderInput,
  idempotencyKey: string,
): Promise<WhatsAppOrderResult> {
  return commerceRequest<WhatsAppOrderResult>(slug, '/storefront/orders/whatsapp', {
    method: 'POST',
    body: input,
    guestToken,
    idempotencyKey,
  });
}

export async function initiateStorefrontPayment(
  slug: string,
  orderId: string,
  idempotencyKey: string,
): Promise<PaymentView> {
  return commerceRequest<PaymentView>(slug, `/storefront/orders/${encodeURIComponent(orderId)}/payments`, {
    method: 'POST',
    idempotencyKey,
  });
}

export async function getStorefrontPayment(slug: string, orderId: string): Promise<PaymentView> {
  return commerceRequest<PaymentView>(slug, `/storefront/orders/${encodeURIComponent(orderId)}/payment`, {
    method: 'GET',
  });
}

export async function getStorefrontOrder(
  slug: string,
  orderId: string,
  lookupToken?: string | null,
): Promise<StorefrontOrderView> {
  const query = lookupToken ? `?token=${encodeURIComponent(lookupToken)}` : '';
  return commerceRequest<StorefrontOrderView>(
    slug,
    `/storefront/orders/${encodeURIComponent(orderId)}${query}`,
    { method: 'GET' },
  );
}

/**
 * GET /storefront/orders/:orderId/tracking (Phase 27 — Part 13).
 * Customer delivery tracking — ONE aggregated payload (order number, payment
 * method/amount, customer-safe tracking number, timeline). The response never
 * contains the shipping provider, provider ids, raw statuses or internal ids.
 */
export async function getStorefrontOrderTracking(
  slug: string,
  orderId: string,
): Promise<CustomerTrackingView> {
  return commerceRequest<CustomerTrackingView>(
    slug,
    `/storefront/orders/${encodeURIComponent(orderId)}/tracking`,
    { method: 'GET' },
  );
}
