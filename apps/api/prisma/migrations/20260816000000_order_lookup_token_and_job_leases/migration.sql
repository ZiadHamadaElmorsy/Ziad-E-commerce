-- ---------------------------------------------------------------------------
-- Ziad E-commerce — Phase 23: Order lookup token + distributed job leases
-- ---------------------------------------------------------------------------
-- 1. orders.lookup_token — per-order secure lookup token (192-bit hex) required
--    to read customer PII through the PUBLIC storefront order confirmation
--    endpoint (docs/API-SPEC.md §36, Phase 23 security review). New orders are
--    always created WITH a token by the checkout pipeline; this migration
--    backfills existing rows so no order is ever left token-less.
-- 2. job_leases — single-row-per-job distributed lease table that lets the
--    cart/reservation expiry sweep run on exactly ONE API instance in a
--    multi-instance deployment (the Phase 21 sweep was per-instance
--    setInterval). The lease auto-expires (lease_expires_at) so a crashed
--    instance never blocks the sweep; the sweep itself stays idempotent.
--
-- Both additions are additive and safe to apply to an existing database.
-- ---------------------------------------------------------------------------

-- 1. Order lookup token (nullable in Prisma; every row below is backfilled).
ALTER TABLE "orders" ADD COLUMN "lookup_token" TEXT;

UPDATE "orders" SET "lookup_token" = gen_random_uuid()::text WHERE "lookup_token" IS NULL;

CREATE UNIQUE INDEX "orders_lookup_token_key" ON "orders"("lookup_token");

-- 2. Distributed job leases (Phase 23 multi-instance sweep safety).
CREATE TABLE "job_leases" (
  "job_name" TEXT NOT NULL,
  "lease_owner" TEXT NOT NULL,
  "acquired_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "lease_expires_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "job_leases_pkey" PRIMARY KEY ("job_name")
);
