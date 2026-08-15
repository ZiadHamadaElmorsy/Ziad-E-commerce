-- ---------------------------------------------------------------------------
-- Ziad E-commerce — RLS policy fixes discovered while executing the RLS
-- database test suites against a real PostgreSQL instance
-- (docs/RLS-TEST-ENVIRONMENT.md, 20260817000000).
--
-- 1. member_membership_select on "store_memberships" was SELF-REFERENTIAL:
--    its USING subquery read "store_memberships" itself. Once any role subject
--    to row-level security reads the table, PostgreSQL rejects the policy with
--    "infinite recursion detected in policy for relation store_memberships".
--    The membership visibility the stores/subscriptions policies depend on is
--    "a user sees their own membership rows", so the policy is replaced with a
--    non-recursive member-own-row form.
--
-- 2. app.set_current_store_id(uuid) was granted only to ziad_runtime. The
--    PUBLIC storefront reads run as the `anon` role (public_storefront_select
--    policies), which must bind the resolved store's tenant context first;
--    without an EXECUTE grant the anon storefront path failed with
--    "permission denied for function set_current_store_id". The function only
--    writes a session GUC, and the anon policies still filter on it, so this
--    grant does not weaken isolation.
--
-- Forward-only: this file is a new migration. Databases that already applied
-- 20260814000000_rls_enforcement get exactly these two fixes.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS member_membership_select ON store_memberships;
CREATE POLICY member_membership_select ON store_memberships
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND "user_id" = auth.uid());

GRANT EXECUTE ON FUNCTION app.set_current_store_id(uuid) TO authenticated, anon;
