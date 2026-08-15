-- ---------------------------------------------------------------------------
-- Ziad E-commerce — Phase 24: RLS app-tenant policies for the special tables
-- ---------------------------------------------------------------------------
-- Source: live RLS enforcement exposed a gap (verified on the live Supabase
-- database). The 28 tenant tables were FORCE RLS'd in Phase 21 and the app
-- now runs tenant-bound transactions under a non-bypass role
-- (`RLS_ENFORCEMENT_ROLE`). The four "special" tables (users, stores,
-- store_memberships, subscriptions) carry ONLY `auth.uid()`-based policies
-- (`member_store_select`, `member_membership_select`, `member_subscription_select`,
-- `user_own_row_select`), which are the Supabase PostgREST model. The
-- application never populates `request.jwt.claims`, so `auth.uid()` returns
-- NULL on the app connection and those policies filter EVERYTHING out.
--
-- Resulting live failures under enforcement:
--   - `PATCH /stores/current`             -> 404 (no SELECT/UPDATE policy)
--   - subscription lazy-expiry transition -> blocked (no UPDATE policy)
--   - any tenant-bound read of the bound store / membership / subscription
--
-- This migration adds the APPLICATION's tenant model as an additional,
-- OR-composed policy set: when a tenant-bound transaction has bound
-- `app.current_store_id()` (TransactionService.runWithTenant), the app must be
-- able to SELECT/UPDATE the store, memberships and subscription rows it is
-- bound to. The existing auth.uid()-based policies are untouched (PostgREST
-- direct access keeps working). RLS stays enabled and FORCED; this does NOT
-- bypass RLS — it makes the app's explicit tenant context the policy key, the
-- same model every other tenant table already uses (`tenant_isolation_*`).
--
-- The policies are additive and safe to re-run (DROP POLICY IF EXISTS +
-- CREATE POLICY is idempotent for a fresh database).
-- ---------------------------------------------------------------------------

-- stores: the app must read and update the store row it is bound to.
-- (Store creation runs on the shared client as the table owner with BYPASSRLS,
--  so no INSERT policy is required for the app path.)
DROP POLICY IF EXISTS app_tenant_store_select ON "stores";
CREATE POLICY app_tenant_store_select ON "stores"
  FOR SELECT TO authenticated
  USING (app.current_store_id() IS NOT NULL AND app.current_store_id() = "stores"."id");

DROP POLICY IF EXISTS app_tenant_store_update ON "stores";
CREATE POLICY app_tenant_store_update ON "stores"
  FOR UPDATE TO authenticated
  USING (app.current_store_id() IS NOT NULL AND app.current_store_id() = "stores"."id")
  WITH CHECK (app.current_store_id() IS NOT NULL AND app.current_store_id() = "stores"."id");

-- store_memberships: the app resolves membership rows for the bound store.
DROP POLICY IF EXISTS app_tenant_membership_select ON "store_memberships";
CREATE POLICY app_tenant_membership_select ON "store_memberships"
  FOR SELECT TO authenticated
  USING ("store_id" = app.current_store_id());

-- subscriptions: the app reads the bound store's subscription and applies the
-- guarded lazy-expiry transition (TRIAL -> EXPIRED) inside runWithTenant.
DROP POLICY IF EXISTS app_tenant_subscription_select ON "subscriptions";
CREATE POLICY app_tenant_subscription_select ON "subscriptions"
  FOR SELECT TO authenticated
  USING ("store_id" = app.current_store_id());

DROP POLICY IF EXISTS app_tenant_subscription_update ON "subscriptions";
CREATE POLICY app_tenant_subscription_update ON "subscriptions"
  FOR UPDATE TO authenticated
  USING ("store_id" = app.current_store_id())
  WITH CHECK ("store_id" = app.current_store_id());
