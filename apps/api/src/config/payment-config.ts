import type { PaymobConfig } from './configuration';

/**
 * Whether the deployment is configured for the Paymob Intention + Unified
 * Checkout flow. The Intention API call needs the secret api_key and the
 * integration id; the hosted checkout URL additionally needs the (non-secret)
 * public key. `PAYMOB_IFRAME_ID` is intentionally not required (Phase 22).
 *
 * This is the shared truth used by the provider's fail-closed initiation, the
 * startup diagnostic and the public storefront payment-methods view.
 */
export function isPaymobConfigured(config: PaymobConfig | undefined): boolean {
  return Boolean(config?.apiKey && config.integrationId && config.publicKey);
}
