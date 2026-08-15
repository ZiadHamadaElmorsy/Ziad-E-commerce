# RLS TEST ENVIRONMENT — Phase 23

**Purpose:** run the previously-blocked RLS/database E2E suites (`264 skipped`)
against a real PostgreSQL instance. All 14 blocked suites were converted to
**env-gated real tests** in Phase 23 — they run whenever
`POSTGRES_RLS_TEST_DATABASE_URL` is set, and are skipped (never faked)
otherwise.

---

## 1. What the suites verify

| File | Verifies |
| --- | --- |
| `database-tests.blocked` | migration contract (tables, `app.*` helpers, RLS enabled + FORCED), tenant context helpers, RLS cross-tenant isolation, transaction rollback |
| `cart-database-tests.blocked` | carts identity CHECK, partial UNIQUE, cart_items UNIQUE/CHECK, cascades, composite FKs, RLS, rollback |
| `catalog-database-tests.blocked` | product/category unique slugs, variant price CHECK, composite FKs, RLS |
| `checkout-database-tests.blocked` | order_number / idempotency uniques, grand-total CHECK, order_items CHECK, reservation context CHECK, composite FKs, rollback, RLS |
| `customer-database-tests.blocked` | customers email uniqueness, address composite FK, RLS |
| `identity-database-tests.blocked` | stores/users/membership uniques, member-scoped RLS |
| `inventory-database-tests.blocked` | inventory/reservation CHECKs, composite FKs, atomic guarded concurrency, RLS |
| `media-database-tests.blocked` | media size/type checks, product_media FKs/uniques, RLS |
| `orders-database-tests.blocked` | order_status enum, snapshot preservation, guarded transitions, RLS |
| `payments-database-tests.blocked` | amount CHECK, provider-reference and webhook-event dedup, composite FKs, RLS |
| `shipping-fulfillment-database-tests.blocked` | sequential guarded transitions, terminal state, RLS |
| `storefront-database-tests.blocked` | anon public-storefront reads, enforcement-role fail-closed |
| `subscription-database-tests.blocked` | one-subscription-per-store unique, RLS |
| `cms-database-tests.blocked` | page slug unique, theme/navigation scoping, RLS |

Every probe runs inside a **rolled-back transaction** — the suites never mutate
a real database.

## 2. Prerequisites

- PostgreSQL 14+ on `localhost:5432` (no Docker required; a local install or a
  hosted test instance both work).
- `psql` / `createdb` on PATH (for the bootstrap scripts) OR any way to create
  a database.
- Node.js 20.9+ and the repository's `node_modules` installed.

## 3. Bootstrap (one-time)

```powershell
# Windows (PowerShell) — creates the DB + applies migrations + verifies roles:
./apps/api/scripts/setup-rls-test-db.ps1 -DbUser postgres -DbPassword postgres

# Or manually:
createdb -U postgres -h localhost ziad_rls_test
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/ziad_rls_test"
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
```

The migrations create everything the tests need:

| Item | Where |
| --- | --- |
| `authenticated`, `anon` (NOLOGIN) | init migration `20260812000000_init` |
| `app.current_store_id()` / `app.set_current_store_id(uuid)` | init migration |
| RLS enabled on all 28 tenant tables + policies | init migration |
| `ziad_runtime NOLOGIN IN ROLE authenticated` | rls_enforcement migration `20260814000000_rls_enforcement` |
| `FORCE ROW LEVEL SECURITY` on all 28 tables | rls_enforcement migration |
| `job_leases` + `orders.lookup_token` | `20260816000000_order_lookup_token_and_job_leases` |

## 4. Run the suites

```powershell
$env:POSTGRES_RLS_TEST_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/ziad_rls_test"
$env:RLS_ENFORCEMENT_ROLE = "ziad_runtime"
npm run test:e2e -w @ziad/api        # full suite incl. the 14 RLS/database suites
# or just the database suites:
cd apps/api
npx jest --config ./test/jest-e2e.json --runInBand blocked
```

The connection user must be a **superuser** (default `postgres`) so it can
`SET LOCAL ROLE ziad_runtime` inside the probe transactions. A non-superuser
login role can be used if it is `IN ROLE ziad_runtime` and granted the switch.

## 5. Reset strategy

```powershell
dropdb -U postgres -h localhost ziad_rls_test
createdb -U postgres -h localhost ziad_rls_test
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/ziad_rls_test"
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
```

`scripts/rls-test-bootstrap.sql` documents the same steps inline.

## 6. Execution status (2026-08-15 — executed)

**The RLS/database suites were EXECUTED and PASS in this repository.** The
local PostgreSQL requirement was provisioned via Scoop (`scoop install
postgresql`), the `ziad_rls_test` database was created, all migrations were
applied, and the full API E2E suite now reports:

```
API E2E:  517 passed / 0 failed / 0 skipped   (34 suites)
          (previously 438 passed / 78 skipped — the 78 RLS/database tests
           were skipped for lack of a local PostgreSQL)
rls-verify.ts: RESULT: PASS — RLS is enforced at the database level.
```

### What was fixed to make the environment executable

1. **UUID casts** — the raw SQL probes passed JS string parameters into `uuid`
   columns; PostgreSQL 18 rejects that (`42804`). `db-helpers.ts` and the
   blocked suites now use explicit `::uuid` casts.
2. **Migration defect: `member_membership_select` recursion** — the policy on
   `store_memberships` sub-queried itself and PostgreSQL rejected it with
   `42P17` (infinite recursion) as soon as a role subject to RLS read the
   table. Fixed by migration **`20260817000000_rls_policy_fixes`**
   (non-recursive `auth.uid() = user_id` policy).
3. **Migration defect: missing `anon` grant** — `app.set_current_store_id(uuid)`
   was not executable by `anon`, so the public-storefront anon path failed with
   `42501`. Granted by the same migration.
4. **RLS INSERT semantics** — a cross-tenant INSERT under RLS raises `42501`
   (it is not a silent 0-row filter); the forged-insert probes were corrected
   to assert the denial.
5. **Test-data corrections** — valid UUIDs for `users.auth_user_id`, NOT NULL
   columns for `navigations.items` / `customer_addresses`, RESTRICT-FK
   SQLSTATE (`23001`), `order_status` enum casts, `RETURNING 1 AS count`, and
   GUC-pollution resets between tests.

The two cross-table composite-FK expectations (`cart_items`, `orders.customer_id`)
were rewritten to assert the ACTUAL parent-tenant RLS boundary: the schema
deliberately inherits the tenant through the parent cart/order (no `store_id`
column on `cart_items`; DATABASE.md §29.4), so the database-level guarantee is
the parent-row policy, not a composite FK.

## 7. Historical blocker (Phase 23)

The Phase 23 validation machine had **no local PostgreSQL and no Docker**
(`psql`, `postgres` service and `docker` were all verified absent). The live
Supabase database is a shared development database and cannot host the
enforcement-role migration without breaking the running application (the app
connects as the table owner with `BYPASSRLS`; applying `FORCE ROW LEVEL
SECURITY` without the runtime role switch would return zero rows). That is why
the suites were originally written as self-skipping. **This is no longer the
case** — the environment described in §1–§5 above is provisioned and green.

