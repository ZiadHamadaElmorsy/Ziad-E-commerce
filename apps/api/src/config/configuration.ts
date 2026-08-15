export interface SupabaseConfig {
  url?: string;
  anonKey?: string;
  serviceRoleKey?: string;
  /** Supabase Storage bucket holding media binaries (Media phase — docs/DATABASE.md §22.2). */
  storageBucket?: string;
}

/**
 * Paymob Accept configuration (docs/MVP-SCOPE.md §35, docs/API-SPEC.md §24).
 * The MVP payment provider is Paymob; the payment domain depends on the
 * provider abstraction, never on these credentials. All values are optional
 * at boot and FAIL CLOSED at call time (the provider refuses to initiate a
 * payment when credentials are missing) — mirroring the Supabase Auth
 * provider's behavior. Secrets are only ever read from the environment.
 */
export interface PaymobConfig {
  /** Paymob Accept API base URL (defaults to https://accept.paymob.com). */
  apiUrl?: string;
  /** Secret API key used to authenticate the Intention API (PAYMOB_API_KEY). */
  apiKey?: string;
  /**
   * Authorization scheme used by the Intention API (PAYMOB_AUTH_SCHEME). The
   * live Paymob endpoint advertises `WWW-Authenticate: Bearer realm=Paymob`
   * (Phase 24 — verified empirically), so the default is `Bearer`. Paymob's
   * published docs list `Token <SECRET_KEY>`; set `Token` if the account or
   * region's Intention API uses that scheme. The credential value MUST be the
   * new-format Paymob Secret Key (`egy_sk_test_...`/`egy_sk_live_...`), not
   * the legacy JWT api_key.
   */
  authScheme?: 'Bearer' | 'Token';
  /** Payment integration id for the payment key request (PAYMOB_INTEGRATION_ID). */
  integrationId?: string;
  /**
   * Legacy hosted iframe id (PAYMOB_IFRAME_ID) — Phase 22: NO LONGER REQUIRED.
   * The provider uses the Paymob Intention API + Unified Checkout, which does
   * not need an iframe id (the Paymob dashboard Iframes page is not used).
   * Kept only for backwards compatibility and the startup diagnostic.
   */
  iframeId?: string;
  /**
   * Paymob public key (PAYMOB_PUBLIC_KEY) used to open the Unified Checkout
   * URL: `{apiUrl}/unifiedcheckout/?public_key=...&client_secret=...`.
   * Not a secret (it is a public identifier from the Paymob dashboard).
   */
  publicKey?: string;
  /** HMAC secret used to verify transaction-process callbacks (PAYMOB_HMAC_SECRET). */
  hmacSecret?: string;
  /**
   * Full public URL of the Paymob webhook endpoint (PAYMOB_WEBHOOK_URL).
   * Sent as `notification_url` on every Intention so callbacks reach the API
   * even when the Paymob dashboard is not configured. Optional.
   */
  webhookUrl?: string;
}

/**
 * Public storefront platform domain (DATABASE §7.2: `store-slug.platform-domain.com`).
 * Used to resolve the Store from the public storefront Host header subdomain.
 */

/** Rate limiting configuration (Phase 21 — production hardening). */
export interface RateLimitConfig {
  /** Master switch; disabled by default under NODE_ENV=test to keep suites stable. */
  enabled: boolean;
  /** Default window in milliseconds applied when a bucket has no override. */
  defaultWindowMs: number;
  /** Default request limit per window when a bucket has no override. */
  defaultLimit: number;
  /** Per-bucket request limits within the default window (see rate-limit.constants). */
  authLimit: number;
  storefrontReadLimit: number;
  cartLimit: number;
  checkoutLimit: number;
  paymentLimit: number;
  orderLookupLimit: number;
  mediaLimit: number;
  webhookLimit: number;
  /** Authenticated merchant API limit (protected surface). */
  merchantApiLimit: number;
}

/** Cart/reservation expiration configuration (Phase 21 — abandoned-cart protection). */
export interface ExpiryConfig {
  /** Cart lifetime TTL in milliseconds (carts.expires_at at creation). */
  cartTtlMs: number;
  /** Inventory reservation lifetime TTL in milliseconds (set at checkout). */
  reservationTtlMs: number;
  /** Master switch for the periodic sweep job. */
  sweepEnabled: boolean;
  /** Sweep interval in milliseconds. */
  sweepIntervalMs: number;
  /** Batch size per Store per sweep run. */
  batchSize: number;
  /**
   * Phase 23 — distributed lease lifetime for the sweep job (job_leases). In a
   * multi-instance deployment only ONE instance may sweep at a time; a crashed
   * instance's lease expires after this TTL so the sweep can never be blocked.
   */
  sweepLeaseTtlMs: number;
}

/**
 * Phase 23 — deployment security knobs.
 */
export interface SecurityConfig {
  /**
   * Send `Strict-Transport-Security` on API responses. MUST only be enabled on
   * an HTTPS-terminated production deployment (SECURITY_HSTS_ENABLED=true).
   * Never send HSTS over plain HTTP.
   */
  hstsEnabled: boolean;
}

/**
 * Phase 23 — reverse-proxy trust. When the API sits behind a reverse proxy /
 * load balancer (production), the client IP for rate limiting comes from the
 * proxy's forwarding headers. Set TRUST_PROXY=1 (all proxies) or a specific
 * proxy address; keep it OFF when the API is directly exposed.
 */
export interface ProxyConfig {
  trustProxy: boolean | string;
}

/** Media upload security configuration (Phase 21). */
export interface MediaConfig {
  /** Maximum accepted upload size in bytes (stream cap + validation). */
  maxUploadBytes: number;
  /** Comma-separated allowlist of accepted MIME types. */
  allowedMimeTypes: string[];
}

export interface AppConfiguration {
  nodeEnv: string;
  port: number;
  databaseUrl?: string;
  corsOrigins: string;
  /** Public storefront platform domain (DATABASE §7.2: `store-slug.platform-domain.com`). */
  storefrontDomain: string;
  /** Whether wildcard-subdomain storefront resolution is enabled (production). */
  storefrontHostResolutionEnabled: boolean;
  /** Free-trial duration in days (BRD BR-SUB-001 — configurable, not hard-coded). */
  subscriptionTrialDays: number;
  /** PostgreSQL role applied via `SET LOCAL ROLE` for RLS enforcement (empty = owner connection). */
  rlsEnforcementRole?: string;
  rateLimit: RateLimitConfig;
  expiry: ExpiryConfig;
  media: MediaConfig;
  supabase: SupabaseConfig;
  paymob: PaymobConfig;
  /** Phase 23 — deployment security knobs (HSTS). */
  security: SecurityConfig;
  /** Phase 23 — reverse-proxy trust for correct client IPs (rate limiting). */
  proxy: ProxyConfig;
}

/** Parses a comma-separated env list into a trimmed non-empty string array. */
function parseList(value: string | undefined, fallback: string[]): string[] {
  if (!value) {
    return fallback;
  }
  const items = value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
  return items.length > 0 ? items : fallback;
}

function parseIntOr(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') {
    return fallback;
  }
  return !['0', 'false', 'no', 'off', 'disabled'].includes(value.trim().toLowerCase());
}

/**
 * Parses TRUST_PROXY into an Express `trust proxy` value. Accepts:
 *   - empty  -> false (direct exposure, client IP is the socket address)
 *   - 1      -> true (all proxies — reasonable behind a single CDN/load balancer)
 *   - anything else -> the raw string (a specific proxy address / subnet)
 */
function parseTrustProxy(value: string | undefined): boolean | string {
  if (value === undefined || value === '') {
    return false;
  }
  const trimmed = value.trim();
  if (trimmed === '1' || trimmed.toLowerCase() === 'true') {
    return true;
  }
  return trimmed;
}

export default (): AppConfiguration => {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const defaultStorefrontHostResolution = nodeEnv === 'production';
  const rateLimitEnabled = parseBoolean(
    process.env.RATE_LIMIT_ENABLED,
    // Disabled by default in test environments so suites are deterministic;
    // rate-limit behavior is covered by dedicated unit + e2e tests.
    nodeEnv !== 'test',
  );
  const sweepEnabled = parseBoolean(
    process.env.RESERVATION_EXPIRY_ENABLED,
    // Disabled by default in test environments; the sweep is unit-tested.
    nodeEnv !== 'test',
  );

  return {
    nodeEnv,
    port: parseInt(process.env.PORT ?? '4000', 10),
    databaseUrl: process.env.DATABASE_URL,
    corsOrigins: process.env.CORS_ORIGINS ?? 'http://localhost:3000',
    storefrontDomain: process.env.STOREFRONT_DOMAIN ?? 'platform-domain.com',
    storefrontHostResolutionEnabled: parseBoolean(
      process.env.STOREFRONT_HOST_RESOLUTION_ENABLED,
      defaultStorefrontHostResolution,
    ),
    subscriptionTrialDays: parseInt(process.env.SUBSCRIPTION_TRIAL_DAYS ?? '14', 10),
    rlsEnforcementRole: process.env.RLS_ENFORCEMENT_ROLE?.trim()
      ? process.env.RLS_ENFORCEMENT_ROLE.trim()
      : undefined,
    rateLimit: {
      enabled: rateLimitEnabled,
      defaultWindowMs: parseIntOr(process.env.RATE_LIMIT_DEFAULT_WINDOW_MS, 60_000),
      defaultLimit: parseIntOr(process.env.RATE_LIMIT_DEFAULT_LIMIT, 300),
      authLimit: parseIntOr(process.env.RATE_LIMIT_AUTH_LIMIT, 60),
      storefrontReadLimit: parseIntOr(process.env.RATE_LIMIT_STOREFRONT_READ_LIMIT, 120),
      cartLimit: parseIntOr(process.env.RATE_LIMIT_CART_LIMIT, 60),
      checkoutLimit: parseIntOr(process.env.RATE_LIMIT_CHECKOUT_LIMIT, 30),
      paymentLimit: parseIntOr(process.env.RATE_LIMIT_PAYMENT_LIMIT, 30),
      orderLookupLimit: parseIntOr(process.env.RATE_LIMIT_ORDER_LOOKUP_LIMIT, 60),
      mediaLimit: parseIntOr(process.env.RATE_LIMIT_MEDIA_LIMIT, 300),
      webhookLimit: parseIntOr(process.env.RATE_LIMIT_WEBHOOK_LIMIT, 120),
      merchantApiLimit: parseIntOr(process.env.RATE_LIMIT_MERCHANT_API_LIMIT, 300),
    },
    expiry: {
      cartTtlMs: parseIntOr(process.env.CART_TTL_MS, 7 * 24 * 60 * 60 * 1000),
      reservationTtlMs: parseIntOr(process.env.RESERVATION_TTL_MS, 30 * 60 * 1000),
      sweepEnabled,
      sweepIntervalMs: parseIntOr(process.env.RESERVATION_EXPIRY_INTERVAL_MS, 5 * 60 * 1000),
      batchSize: parseIntOr(process.env.RESERVATION_EXPIRY_BATCH_SIZE, 100),
      sweepLeaseTtlMs: parseIntOr(process.env.RESERVATION_EXPIRY_LEASE_TTL_MS, 10 * 60 * 1000),
    },
    security: {
      // HSTS must be explicitly enabled on an HTTPS-terminated production
      // deployment. Never send it from an HTTP server.
      hstsEnabled:
        nodeEnv === 'production' &&
        parseBoolean(process.env.SECURITY_HSTS_ENABLED, false),
    },
    proxy: {
      trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
    },
    media: {
      maxUploadBytes: parseIntOr(process.env.MEDIA_MAX_UPLOAD_BYTES, 10 * 1024 * 1024),
      allowedMimeTypes: parseList(process.env.MEDIA_ALLOWED_MIME_TYPES, [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'image/avif',
      ]),
    },
    supabase: {
      url: process.env.SUPABASE_URL,
      anonKey: process.env.SUPABASE_ANON_KEY,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      storageBucket: process.env.SUPABASE_STORAGE_BUCKET,
    },
    paymob: {
      apiUrl: process.env.PAYMOB_API_URL,
      apiKey: process.env.PAYMOB_API_KEY,
      authScheme:
        process.env.PAYMOB_AUTH_SCHEME?.trim().toLowerCase() === 'token' ? 'Token' : 'Bearer',
      integrationId: process.env.PAYMOB_INTEGRATION_ID,
      iframeId: process.env.PAYMOB_IFRAME_ID,
      publicKey: process.env.PAYMOB_PUBLIC_KEY,
      hmacSecret: process.env.PAYMOB_HMAC_SECRET,
      webhookUrl: process.env.PAYMOB_WEBHOOK_URL,
    },
  };
};
