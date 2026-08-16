-- ---------------------------------------------------------------------------
-- Phase 25 — Performance indexes (production performance audit)
-- ---------------------------------------------------------------------------
-- Justified by the ACTUAL query patterns of the merchant API (measured):
--
--   1. Every store-scoped collection list orders by `created_at DESC`
--      (products, orders, customers, categories, media). Composite
--      (store_id, created_at DESC) indexes make the sort index-backed instead
--      of a per-store sort at scale (Merchant B with 100,000 rows must not
--      sort its slice on every page load).
--
--   2. Order lists are filtered by status AND sorted newest-first — a leading
--      (store_id, status, created_at DESC) index serves both in one pass.
--
--   3. Search is server-side and uses Prisma `contains` + `mode: insensitive`
--      (i.e. ILIKE '%term%'). A B-tree cannot serve leading-wildcard ILIKE;
--      pg_trgm GIN indexes make product/order/customer search index-backed as
--      stores grow to thousands of rows. The pg_trgm extension is available on
--      Supabase (safe, widely used).
--
-- These indexes do NOT weaken RLS/tenant isolation: every index is a plain
-- secondary index on store-scoped query columns; no row-level security
-- behavior changes.
-- ---------------------------------------------------------------------------

-- 1. List ordering (newest-first) composite indexes -------------------------
CREATE INDEX IF NOT EXISTS "products_store_id_created_at_idx"
  ON "products" ("store_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "customers_store_id_created_at_idx"
  ON "customers" ("store_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "categories_store_id_created_at_idx"
  ON "categories" ("store_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "media_store_id_created_at_idx"
  ON "media" ("store_id", "created_at" DESC);

-- 2. Orders: status filter + newest-first sort in one index -----------------
CREATE INDEX IF NOT EXISTS "orders_store_id_status_created_at_idx"
  ON "orders" ("store_id", "status", "created_at" DESC);

-- 3. pg_trgm GIN indexes for ILIKE search -----------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "products_name_trgm_idx"
  ON "products" USING GIN ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "products_slug_trgm_idx"
  ON "products" USING GIN ("slug" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "orders_order_number_trgm_idx"
  ON "orders" USING GIN ("order_number" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "orders_customer_email_trgm_idx"
  ON "orders" USING GIN ("customer_email" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "orders_customer_phone_trgm_idx"
  ON "orders" USING GIN ("customer_phone" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "customers_first_name_trgm_idx"
  ON "customers" USING GIN ("first_name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "customers_last_name_trgm_idx"
  ON "customers" USING GIN ("last_name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "customers_email_trgm_idx"
  ON "customers" USING GIN ("email" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "customers_phone_trgm_idx"
  ON "customers" USING GIN ("phone" gin_trgm_ops);
