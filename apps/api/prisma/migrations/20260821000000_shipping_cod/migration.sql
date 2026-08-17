-- ---------------------------------------------------------------------------
-- Ziad E-commerce — Phase 27: Cash on Delivery + Shipping (Bosta integration)
-- ---------------------------------------------------------------------------
-- Extends the existing schema WITHOUT touching working modules:
--
--   1. orders.payment_method / orders.payment_status — order-level payment
--      state, SEPARATE from the order lifecycle (order.status) and the carrier
--      state (shipments.status). Existing orders default to ONLINE / UNPAID so
--      every legacy flow keeps working unchanged.
--
--   2. shipments + shipment_status_history — the carrier shipment aggregate
--      behind the ShippingProvider abstraction. One shipment per order per
--      store (`UNIQUE (store_id, order_id)`) makes merchant "Create Shipment"
--      idempotent at the database level; `UNIQUE (provider, provider_shipment_id)`
--      prevents the same carrier shipment being stored twice across stores.
--
--   3. RLS — both tables follow the exact tenant policy set used by every other
--      store-scoped table: tenant_isolation_* (TO authenticated) for the app
--      connection under the enforcement role, public_storefront_select (TO anon)
--      for the customer tracking endpoint, FORCE RLS, and DML grants to
--      ziad_runtime (grants are NOT inherited from the 20260814000000
--      "ALL TABLES" GRANT — that ran before these tables existed).
--
-- All additions are additive; existing rows are untouched.
-- ---------------------------------------------------------------------------

-- 1. Order payment enums + columns ------------------------------------------
DO $$ BEGIN
  CREATE TYPE "order_payment_method" AS ENUM ('ONLINE', 'COD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "order_payment_status" AS ENUM ('PAID', 'UNPAID', 'FAILED', 'REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_method" "order_payment_method" NOT NULL DEFAULT 'ONLINE';
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_status" "order_payment_status" NOT NULL DEFAULT 'UNPAID';

-- Order list filtering by payment method/status (merchant dashboard).
CREATE INDEX IF NOT EXISTS "orders_store_id_payment_method_idx"
  ON "orders" ("store_id", "payment_method");
CREATE INDEX IF NOT EXISTS "orders_store_id_payment_status_idx"
  ON "orders" ("store_id", "payment_status");

-- 2. Shipping enums + tables -------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "shipping_provider" AS ENUM ('BOSTA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "shipment_status" AS ENUM (
    'CREATED', 'HANDED_TO_COURIER', 'AT_DELIVERY_CENTER', 'OUT_FOR_DELIVERY',
    'DELIVERED', 'REJECTED', 'DELIVERY_FAILED', 'RETURNED', 'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "shipments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "store_id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "provider" "shipping_provider" NOT NULL,
  "provider_shipment_id" TEXT,
  "tracking_number" TEXT,
  "status" "shipment_status" NOT NULL DEFAULT 'CREATED',
  "cod_amount" BIGINT NOT NULL,
  "shipping_cost" BIGINT NOT NULL DEFAULT 0,
  "last_provider_status" TEXT,
  "raw_provider_data" JSONB,
  "error_message" TEXT,
  "printed_label_url" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "delivered_at" TIMESTAMPTZ,
  CONSTRAINT "shipments_pkey" PRIMARY KEY ("id"),

CREATE UNIQUE INDEX IF NOT EXISTS "shipments_store_id_order_id_key"
  ON "shipments" ("store_id", "order_id");
CREATE UNIQUE INDEX IF NOT EXISTS "shipments_provider_provider_shipment_id_key"
  ON "shipments" ("provider", "provider_shipment_id");
CREATE INDEX IF NOT EXISTS "shipments_store_id_status_idx"
  ON "shipments" ("store_id", "status");
CREATE INDEX IF NOT EXISTS "shipments_store_id_created_at_idx"
  ON "shipments" ("store_id", "created_at");
-- Tracking refresh / webhook resolution by provider id (no store scan).
CREATE INDEX IF NOT EXISTS "shipments_provider_shipment_id_idx"
  ON "shipments" ("provider_shipment_id");

CREATE TABLE IF NOT EXISTS "shipment_status_history" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "store_id" UUID NOT NULL,
  "shipment_id" UUID NOT NULL,
  "previous_status" "shipment_status",
  "new_status" "shipment_status" NOT NULL,
  "provider_status" TEXT,
  "source" TEXT NOT NULL,
  "provider_event_id" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "shipment_status_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shipment_status_history_store_id_fkey" FOREIGN KEY ("store_id")
    REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "shipment_status_history_shipment_id_fkey" FOREIGN KEY ("shipment_id")
    REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "shipment_status_history_shipment_id_provider_event_id_key"
  ON "shipment_status_history" ("shipment_id", "provider_event_id");
CREATE INDEX IF NOT EXISTS "shipment_status_history_shipment_id_created_at_idx"
  ON "shipment_status_history" ("shipment_id", "created_at");


-- 3. RLS ----------------------------------------------------------------------
ALTER TABLE "shipments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shipment_status_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shipments" FORCE ROW LEVEL SECURITY;
ALTER TABLE "shipment_status_history" FORCE ROW LEVEL SECURITY;

-- App connection (authenticated / ziad_runtime inside runWithTenant) — the
-- exact tenant_isolation_* policy set used by every store-scoped table.
DROP POLICY IF EXISTS tenant_isolation_select ON "shipments";
CREATE POLICY tenant_isolation_select ON "shipments"
  FOR SELECT TO authenticated
  USING ("store_id" = app.current_store_id());
DROP POLICY IF EXISTS tenant_isolation_insert ON "shipments";
CREATE POLICY tenant_isolation_insert ON "shipments"
  FOR INSERT TO authenticated
  WITH CHECK ("store_id" = app.current_store_id());
DROP POLICY IF EXISTS tenant_isolation_update ON "shipments";
CREATE POLICY tenant_isolation_update ON "shipments"
  FOR UPDATE TO authenticated
  USING ("store_id" = app.current_store_id())
  WITH CHECK ("store_id" = app.current_store_id());
DROP POLICY IF EXISTS tenant_isolation_delete ON "shipments";
CREATE POLICY tenant_isolation_delete ON "shipments"
  FOR DELETE TO authenticated
  USING ("store_id" = app.current_store_id());

DROP POLICY IF EXISTS tenant_isolation_select ON "shipment_status_history";
CREATE POLICY tenant_isolation_select ON "shipment_status_history"
  FOR SELECT TO authenticated
  USING ("store_id" = app.current_store_id());
DROP POLICY IF EXISTS tenant_isolation_insert ON "shipment_status_history";
CREATE POLICY tenant_isolation_insert ON "shipment_status_history"
  FOR INSERT TO authenticated
  WITH CHECK ("store_id" = app.current_store_id());
DROP POLICY IF EXISTS tenant_isolation_update ON "shipment_status_history";
CREATE POLICY tenant_isolation_update ON "shipment_status_history"
  FOR UPDATE TO authenticated
  USING ("store_id" = app.current_store_id())
  WITH CHECK ("store_id" = app.current_store_id());
DROP POLICY IF EXISTS tenant_isolation_delete ON "shipment_status_history";
CREATE POLICY tenant_isolation_delete ON "shipment_status_history"
  FOR DELETE TO authenticated
  USING ("store_id" = app.current_store_id());

-- Customer tracking endpoint (PostgREST anon surface) — store-scoped reads
-- only; raw carrier internals never leave the app layer.
DROP POLICY IF EXISTS public_storefront_select ON "shipments";
CREATE POLICY public_storefront_select ON "shipments"
  FOR SELECT TO anon
  USING ("store_id" = app.current_store_id());
DROP POLICY IF EXISTS public_storefront_select ON "shipment_status_history";
CREATE POLICY public_storefront_select ON "shipment_status_history"
  FOR SELECT TO anon
  USING ("store_id" = app.current_store_id());

-- DML grants for the enforcement role (created after the ALL-TABLES grant).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "shipments" TO ziad_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "shipment_status_history" TO ziad_runtime;

  CONSTRAINT "shipments_store_id_fkey" FOREIGN KEY ("store_id")
    REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "shipments_store_order_fkey" FOREIGN KEY ("store_id", "order_id")
    REFERENCES "orders"("store_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "shipments_cod_amount_check" CHECK ("cod_amount" >= 0),
  CONSTRAINT "shipments_shipping_cost_check" CHECK ("shipping_cost" >= 0)
);
