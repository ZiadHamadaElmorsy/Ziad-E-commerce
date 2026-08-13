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
  /** Secret API key used to obtain the auth token (PAYMOB_API_KEY). */
  apiKey?: string;
  /** Payment integration id (PAYMOB_INTEGRATION_ID). */
  integrationId?: string;
  /** Hosted iframe id the storefront embeds (PAYMOB_IFRAME_ID). */
  iframeId?: string;
  /** HMAC secret used to verify transaction-process callbacks (PAYMOB_HMAC_SECRET). */
  hmacSecret?: string;
}

export interface AppConfiguration {
  nodeEnv: string;
  port: number;
  databaseUrl?: string;
  corsOrigins: string;
  /** Public storefront platform domain (DATABASE §7.2: `store-slug.platform-domain.com`). */
  storefrontDomain: string;
  /** Free-trial duration in days (BRD BR-SUB-001 — configurable, not hard-coded). */
  subscriptionTrialDays: number;
  supabase: SupabaseConfig;
  paymob: PaymobConfig;
}

export default (): AppConfiguration => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '4000', 10),
  databaseUrl: process.env.DATABASE_URL,
  corsOrigins: process.env.CORS_ORIGINS ?? 'http://localhost:3000',
  storefrontDomain: process.env.STOREFRONT_DOMAIN ?? 'platform-domain.com',
  subscriptionTrialDays: parseInt(process.env.SUBSCRIPTION_TRIAL_DAYS ?? '14', 10),
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    storageBucket: process.env.SUPABASE_STORAGE_BUCKET,
  },
  paymob: {
    apiUrl: process.env.PAYMOB_API_URL,
    apiKey: process.env.PAYMOB_API_KEY,
    integrationId: process.env.PAYMOB_INTEGRATION_ID,
    iframeId: process.env.PAYMOB_IFRAME_ID,
    hmacSecret: process.env.PAYMOB_HMAC_SECRET,
  },
});
