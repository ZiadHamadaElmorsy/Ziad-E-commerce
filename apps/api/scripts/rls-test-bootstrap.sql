# ---------------------------------------------------------------------------
# Ziad E-commerce — RLS test database bootstrap (Phase 23)
# ---------------------------------------------------------------------------
# The RLS/database integration suites (test/*.blocked.e2e-spec.ts) run against
# a dedicated local PostgreSQL database. All roles (authenticated, anon,
# ziad_runtime), the app schema helpers, FORCE ROW LEVEL SECURITY and the
# policies are created BY THE MIGRATIONS, so the bootstrap is intentionally
# tiny: create the database and run `prisma migrate deploy`.
#
# Requirements:
#   - PostgreSQL 14+ installed and running on localhost:5432
#   - a superuser (default `postgres` / password `postgres`) for createdb
#
# Manual steps (or use setup-rls-test-db.ps1 / .sh):
#
#   1. Create the database:
#        createdb -U postgres -h localhost ziad_rls_test
#
#   2. Apply ALL migrations (init -> rls_enforcement -> whatsapp ->
#      order_lookup_token_and_job_leases):
#        set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ziad_rls_test
#        npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
#
#      The init migration creates `authenticated` + `anon` (NOLOGIN) and the
#      app.current_store_id() / app.set_current_store_id(uuid) helpers; the
#      rls_enforcement migration creates `ziad_runtime NOLOGIN IN ROLE
#      authenticated` and FORCE ROW LEVEL SECURITY on all 28 tenant tables.
#
#   3. Grant the superuser switch rights if the test connection is not
#      superuser (e.g. a dedicated `ziad_rls_runner` login role):
#
#        CREATE ROLE ziad_rls_runner LOGIN PASSWORD 'runner' IN ROLE ziad_runtime;
#        -- the runner inherits ziad_runtime's privileges; as a superuser the
#        -- default `postgres` connection can SET ROLE without any grant.
#
#   4. Run the suites:
#        set POSTGRES_RLS_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ziad_rls_test
#        set RLS_ENFORCEMENT_ROLE=ziad_runtime
#        npm run test:e2e -w @ziad/api
#
#   The suites are self-cleaning: every probe runs in a transaction that is
#   rolled back (scratch stores/products are never committed).
#
# Reset strategy (fresh database):
#        dropdb -U postgres -h localhost ziad_rls_test
#        createdb -U postgres -h localhost ziad_rls_test
#        (repeat step 2)
# ---------------------------------------------------------------------------
-- This file is intentionally documentation-only; the actual DDL lives in the
-- migrations. It exists so `psql -f scripts/rls-test-bootstrap.sql` works as
-- a no-op sanity check that the database is reachable:
SELECT current_setting('server_version') AS postgres_version;
SELECT 1 AS bootstrap_ok;
