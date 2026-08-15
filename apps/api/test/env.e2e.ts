/**
 * Jest e2e environment setup.
 *
 * Runs before the test file is imported, so process.env values are present
 * before AppModule (and its ConfigModule validation) is evaluated.
 * Placeholder values only — the e2e suite overrides PrismaService, so no real
 * database is contacted.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/ziad_e2e';
// Phase 21 — host-based storefront resolution is gated by
// STOREFRONT_HOST_RESOLUTION_ENABLED (default on only in production). The e2e
// suite explicitly verifies subdomain resolution, so it is enabled here.
process.env.STOREFRONT_HOST_RESOLUTION_ENABLED = 'true';
// Phase 24 — the e2e suite must be deterministic regardless of the developer's
// root `.env` (which now holds real Paymob credentials). dotenv never
// overrides an existing process.env entry, so pinning these to empty makes the
// public storefront report payOnline=false and keeps the payment-availability
// e2e expectations stable in any environment.
process.env.PAYMOB_API_URL = '';
process.env.PAYMOB_API_KEY = '';
process.env.PAYMOB_INTEGRATION_ID = '';
process.env.PAYMOB_PUBLIC_KEY = '';
process.env.PAYMOB_HMAC_SECRET = '';
process.env.PAYMOB_WEBHOOK_URL = '';
