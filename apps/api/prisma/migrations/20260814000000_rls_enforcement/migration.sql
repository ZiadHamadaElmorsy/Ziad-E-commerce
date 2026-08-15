-- ---------------------------------------------------------------------------
-- Ziad E-commerce — Phase 21: RLS effective enforcement
-- ---------------------------------------------------------------------------
-- Source: docs/PRODUCT-AUDIT-PHASE20.md §15 (RLS was decorative — the
-- application connected as the table owner `postgres`, which bypasses RLS;
-- RLS was enabled but never FORCED, and the app never ran as a member role).
--
-- This migration makes RLS ENFORCED for the application connection WITHOUT
-- deleting any policy and WITHOUT disabling RLS:
--
--   1. Creates a NOLOGIN runtime role `ziad_runtime` that is a MEMBER of the
--      existing `authenticated` role, so every existing `TO authenticated`
--      policy (tenant_isolation_*, user_own_row_select, ...) applies to it.
--   2. Grants `ziad_runtime` the same DML privileges and function execution
--      rights the application needs.
--   3. FORCE ROW LEVEL SECURITY on all 28 tenant tables, so even a table
--      owner is subject to policies when running under a role subject to RLS.
--
-- Deployment contract (documented in IMPLEMENTATION-PHASE21):
--   - The application must connect as `ziad_runtime` (DATABASE_URL) OR switch
--     the transaction role via `SET LOCAL ROLE` (RLS_ENFORCEMENT_ROLE) —
--     implemented in RlsTenantBinder.bind().
--   - Every application query that must see tenant data must run inside a
--     tenant-bound transaction (`TransactionService.runWithTenant`), which
--     sets `app.current_store_id()`; RLS then filters by that value. The
--     Phase 21 report documents which application reads still use the shared
--     client and why full enforcement is staged.
--   - Applying this migration while the app still connects as the table owner
--     WITHOUT the role switch WILL break reads (owner + FORCE RLS + NULL
--     tenant context = zero rows). Apply only together with the runtime role.
--
-- The role provisioning is idempotent (safe to re-run / diff against the
-- initial migration on a fresh database).
-- ---------------------------------------------------------------------------

CREATE ROLE ziad_runtime NOLOGIN IN ROLE authenticated;

GRANT USAGE ON SCHEMA public TO ziad_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ziad_runtime;
GRANT USAGE ON SCHEMA app TO ziad_runtime;
GRANT EXECUTE ON FUNCTION app.set_current_store_id(uuid) TO ziad_runtime;
GRANT EXECUTE ON FUNCTION app.current_store_id() TO ziad_runtime;

ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
ALTER TABLE "stores" FORCE ROW LEVEL SECURITY;
ALTER TABLE "store_memberships" FORCE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "products" FORCE ROW LEVEL SECURITY;
ALTER TABLE "product_variants" FORCE ROW LEVEL SECURITY;
ALTER TABLE "categories" FORCE ROW LEVEL SECURITY;
ALTER TABLE "product_categories" FORCE ROW LEVEL SECURITY;
ALTER TABLE "inventory" FORCE ROW LEVEL SECURITY;
ALTER TABLE "inventory_reservations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "inventory_movements" FORCE ROW LEVEL SECURITY;
ALTER TABLE "customers" FORCE ROW LEVEL SECURITY;
ALTER TABLE "customer_addresses" FORCE ROW LEVEL SECURITY;
ALTER TABLE "carts" FORCE ROW LEVEL SECURITY;
ALTER TABLE "cart_items" FORCE ROW LEVEL SECURITY;
ALTER TABLE "orders" FORCE ROW LEVEL SECURITY;
ALTER TABLE "order_items" FORCE ROW LEVEL SECURITY;
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;
ALTER TABLE "payment_attempts" FORCE ROW LEVEL SECURITY;
ALTER TABLE "payment_events" FORCE ROW LEVEL SECURITY;
ALTER TABLE "pages" FORCE ROW LEVEL SECURITY;
ALTER TABLE "page_sections" FORCE ROW LEVEL SECURITY;
ALTER TABLE "navigations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "theme_configurations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "media" FORCE ROW LEVEL SECURITY;
ALTER TABLE "product_media" FORCE ROW LEVEL SECURITY;
ALTER TABLE "store_settings" FORCE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
