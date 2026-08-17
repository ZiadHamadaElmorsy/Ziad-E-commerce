-- ---------------------------------------------------------------------------
-- Phase 26 — Catalog gallery & variant attributes
-- ---------------------------------------------------------------------------
-- Extends the EXISTING catalog domain (no new tables, no second media system):
--
--   1. product_variants.attributes (JSONB)  — structured variant attributes
--      (e.g. { "color": "Black", "size": "M" }) powering the storefront
--      color/size selectors. Nullable + additive: legacy variants keep only
--      `name` and keep working unchanged.
--
--   2. product_media.is_primary (bool)      — primary/cover image flag on the
--      existing Product↔Media association (the same row that already carries
--      sort_order and variant_id). At most one PRIMARY per product is enforced
--      by the application with guarded UPDATEs; the column stays a plain
--      boolean so concurrent primary swaps cannot deadlock on a partial
--      unique index.
--
--   3. products.name_ar / name_en (text)   — optional multilingual labels.
--
--   4. categories.name_ar / name_en (text) — optional multilingual labels.
--
-- All additions are nullable / defaulted, so the migration is safe on a live
-- database with existing rows. No RLS changes are required: RLS is keyed on
-- store_id, and these columns are plain data columns on tables that already
-- carry store-scoped policies. The gallery list query is served by the
-- existing product_media(product_id) + media(store_id, id) indexes; the
-- primary-image list query (storefront/product lists) is served by a new
-- composite (store_id, product_id, is_primary, sort_order) index.
-- ---------------------------------------------------------------------------

-- 1. Variant attributes ------------------------------------------------------
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "attributes" JSONB;

-- 2. Primary image flag on the existing product_media association -----------
ALTER TABLE "product_media" ADD COLUMN IF NOT EXISTS "is_primary" BOOLEAN NOT NULL DEFAULT false;

-- 3. Multilingual product labels ---------------------------------------------
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "name_ar" TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "name_en" TEXT;

-- 4. Multilingual category labels --------------------------------------------
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "name_ar" TEXT;
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "name_en" TEXT;

-- 5. Primary-image list lookup (product list rows fetch exactly one cover) ---
CREATE INDEX IF NOT EXISTS "product_media_store_product_primary_idx"
  ON "product_media" ("store_id", "product_id", "is_primary", "sort_order");
