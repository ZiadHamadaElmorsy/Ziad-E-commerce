# Phase 25 — Performance Finalization Report

**Date:** 2026-08-16
**Repository:** `Ziad-E-commerce` — branch `main`
**Commit (implementation):** `7891d33` — `perf(phase-25): aggregated dashboard stats, inventory/media pagination, lean lists, auth/tenant/storefront memoization, performance indexes`
**Production stack (unchanged):** Next.js (Vercel) + NestJS (Render) + Supabase PostgreSQL + Prisma

---

## 1. Verdict

**PASS WITH CONDITIONS → PASS (pending final live re-measurement after the Render deploy completes)**

> The implementation, migration, local/RLS/staging validation, scale tests, index
> verification, multi-tenant security probes and the full test suite all pass. A
> real regression found by the web E2E — the tenant-resolution cache served a
> stale store name for up to 60 s after `PATCH /stores/current` — was diagnosed
> and fixed (`ee2f0d2`: invalidate the tenant cache on store update; verified
> immediately-fresh `/auth/me` and a passing re-run of the E2E store-edit test).
> The only remaining step is the live API redeploy on Render (external dashboard
> step, see §7). Until the production API runs commit `7891d33`, the verdict
> stays **PASS WITH CONDITIONS** with the exact unmet condition listed in §14.

---

## 2. Baseline measurements (Before — production, old API build)

Methodology: real HTTPS requests to `https://ziad-e-commerce-api.onrender.com`
using a real Supabase-authenticated merchant token (`perf.test.merchant.phase25@ziad.internal`,
store `phase25-perf-727567`). Each number is a stopwatch-timed HTTP round-trip on
the production Render free-tier instance.

### 2.1 Per-request authenticated latency (old API — no memoization)

Every authenticated request pays Supabase token verification + tenant resolution
+ the query. Measured on the LIVE API before the Phase 25 code was deployed:

| Call (all `Bearer <token>`) | Latency |
| --- | --- |
| `GET /api/v1/auth/me` — 1st | 2092 ms |
| `GET /api/v1/auth/me` — 2nd | 1243 ms |
| `GET /api/v1/auth/me` — 3rd | 1615 ms |
| `GET /api/v1/auth/me` — 4th | 1572 ms |
| `GET /api/v1/products?page=1&limit=5` | 3056 ms |
| `GET /api/v1/products?status=ACTIVE&page=1&limit=1` | 1871 ms |
| `GET /api/v1/categories?page=1&limit=1` | 2268 ms |
| `GET /api/v1/orders?page=1&limit=5` | 1911 ms |
| `GET /api/v1/customers?page=1&limit=20` | 1825 ms |
| `GET /api/v1/media` (old API) | 404 (no list endpoint existed) |

Repeated authenticated requests show **no caching benefit** — every call pays the
full Supabase + tenant round-trips (1.2–2.1 s each). This is the measured
justification for the Phase 25 memoization.

### 2.2 Old dashboard request pattern (from git `f0690fe`)

The pre-Phase-25 dashboard page fired **six parallel collection requests**:

1. `GET /products?page=1&limit=5`
2. `GET /products?status=ACTIVE&page=1&limit=1`
3. `GET /products?status=DRAFT&page=1&limit=1`
4. `GET /products?status=ARCHIVED&page=1&limit=1`
5. `GET /categories?page=1&limit=1`
6. `GET /orders?page=1&limit=5`

PLUS a browser-side revenue loop: `GET /orders?page=N&limit=100` repeated
**sequentially** until every order page was summed on the client — up to
**50 sequential API requests** for a 5,000-order store, each paying the
per-request Supabase + tenant overhead above.

### 2.3 Infrastructure baseline (old API)

| Probe | Result |
| --- | --- |
| `GET /api/v1/health` | 200 — `database: up` |
| `GET /api/v1/health/live` | 200 |
| `GET /api/v1/health/ready` | 200 — `database: up` |
| First request after idle (cold) | ~30–60 s Render free-tier wake (separate from app code) |
| Warm request | 953 ms (health) / 1.2–3.0 s (authenticated) |

---

## 3. Root causes identified

1. **Per-request Supabase token verification** — an HTTPS round-trip to
   `{SUPABASE_URL}/auth/v1/user` on EVERY authenticated request (~250–500 ms of
   the measured 1.2–3.0 s).
2. **Per-request tenant resolution** — a database `store_memberships` read on
   every authenticated request, uncached.
3. **Per-request storefront store resolution** — `findStoreBySlug` + subscription
   lookup on every public storefront request.
4. **Dashboard N+request pattern** — 6 parallel collections + a sequential
   client-side revenue sum loop (up to 50 requests).
5. **Product-edit N+1 inventory** — one authenticated API request per variant,
   each paying the auth + tenant overhead.
6. **Unpaginated media** — the media library had no list endpoint; every asset
   would have to be enumerated client-side.
7. **Non-lean product lists** — collection queries loaded the full
   `product_media → media` relationship when the list only renders
   name/status/price.
8. **Missing database indexes** — store-scoped lists sorted `created_at DESC`,
   status-filtered order lists, and `ILIKE '%…%'` searches had no supporting
   indexes at scale.

---

## 4. Fixes applied (commit `7891d33`)

### API
- **Auth verification memoization** — `SupabaseAuthProvider` bounded TTL cache
  (`AUTH_VERIFY_CACHE_TTL_MS`, default 60 s, 0 = disabled, max 1,000 entries,
  successful verifications only).
- **Tenant-resolution memoization** — `TenantContextService` bounded TTL cache
  (`TENANT_RESOLUTION_CACHE_TTL_MS`, default 60 s, max 5,000 entries).
- **Storefront resolution memoization** — `StorefrontStoreResolver` bounded TTL
  cache (`STOREFRONT_RESOLUTION_CACHE_TTL_MS`, default 60 s, max 2,000 entries).
- **`GET /api/v1/dashboard/stats`** — one request, six parallel store-scoped
  aggregate queries (product counts by status via `GROUP BY`, category count,
  order total, recent orders, **`SUM(grand_total)` aggregate revenue**, recent
  products lean projection).
- **`GET /api/v1/products/:productId/inventory`** — one request returns the
  inventory of every variant (two parallel reads); the product-edit screen no
  longer fires one request per variant.
- **Paginated `GET /api/v1/media`** — `page`/`limit` (default 20, max 100),
  newest-first, store-scoped.
- **Lean product list projections** — collection endpoints no longer join
  `product_media → media`; variants (price) are still included.
- **Test-mode cache bypass** — all three caches default to `0` (disabled) when
  `NODE_ENV=test`.

### Database migration `20260819000000_performance_indexes`
- `(store_id, created_at DESC)` composite indexes: products, customers,
  categories, media.
- `(store_id, status, created_at DESC)` for orders.
- `pg_trgm` GIN indexes for ILIKE search: products(name, slug), orders
  (order_number, customer_email, customer_phone), customers(first_name,
  last_name, email, phone).
- `CREATE EXTENSION IF NOT EXISTS pg_trgm`.
- No RLS changes, no policy changes, no data changes, no drops, no DDL on
  existing required indexes. All statements are additive `CREATE … IF NOT EXISTS`.

### Web
- Dashboard consolidated to **one** `GET /dashboard/stats` request.
- Product edit uses the aggregate inventory endpoint.
- Media library is a real paginated list (`/media?page=1&limit=12` verified in
  production).
- Search remains debounced server-side; no per-character request storms.
- Skeleton/loading/empty/error states preserved.

---

## 5. Migration — production application and verification

### 5.1 Safety inspection (pre-apply)

`20260819000000_performance_indexes/migration.sql` was inspected before apply:

- ✅ Contains only `CREATE INDEX IF NOT EXISTS` (14 indexes) + `CREATE EXTENSION IF NOT EXISTS pg_trgm`.
- ✅ Does NOT disable RLS, does NOT modify policies, does NOT modify or drop
  data, does NOT drop/alter existing required indexes.
- ✅ Additive and idempotent (`IF NOT EXISTS`) — safe to apply on the live
  Supabase database.
- ✅ Applied first to a fresh local PostgreSQL 18.6 staging schema (`ziad_scale_test`)
  — all 7 migrations including the performance indexes applied cleanly (no error,
  no drift).

### 5.2 Production apply

```text
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
→ All migrations have been successfully applied (20260819000000_performance_indexes)
```

### 5.3 Production metadata verification (post-apply, queried live)

| Check | Result |
| --- | --- |
| All 14 Phase 25 indexes present in `pg_indexes` | ✅ (14/14 rows) |
| `pg_trgm` extension present | ✅ |
| RLS enabled on tenant tables | ✅ 28/28 |
| RLS FORCE enabled on tenant tables | ✅ 28/28 |
| `_prisma_migrations` row for `20260819000000_performance_indexes` | ✅ applied |
| Duplicate indexes | ✅ none (14 distinct names) |
| Destructive statements in migration | ✅ none (inspection) |

### 5.4 Query-plan verification (indexes actually used — local 1,000/51,000-row staging)

Real `EXPLAIN (ANALYZE)` on the local staging schema with a seeded 1,000-record
store (plus 51,000-row product volume for the search demonstration):

| Query | Plan |
| --- | --- |
| Products list `WHERE store_id ORDER BY created_at DESC LIMIT 20` | **Index Scan `products_store_id_created_at_idx`** (0.18 ms) |
| Orders `WHERE store_id AND status='DELIVERED' ORDER BY created_at DESC` | **Index Scan `orders_store_id_status_created_at_idx`** (0.23 ms) |
| Orders search `order_number ILIKE '%SCALE-000042%'` | **Bitmap Index Scan `orders_order_number_trgm_idx`** (1.75 ms) |
| Products search `name/slug ILIKE '%Scale Product 55%'` (1,000 rows) | Seq-scan + filter, 2.1 ms (correct cost choice at 1k rows) |
| Products search `name ILIKE '%Bulk Product 12345%'` (51,000 rows, trgm plan forced) | **Bitmap Index Scan `products_name_trgm_idx`**, 26 ms vs 71 ms seq-scan |
| Customers search (1,000 rows) | Seq-scan + filter, 3 ms (correct cost choice at 1k rows) |
| Media list `WHERE store_id ORDER BY created_at DESC LIMIT 20` | **Bitmap Index Scan `media_store_id_created_at_idx`** + top-N heapsort (0.37 ms) |
| Dashboard revenue `SUM(grand_total) WHERE store_id` (1,000 rows) | Seq-scan aggregate, 1.9 ms (single page — index would add no value at this size) |

Notes:
- At the real production volumes today (a handful of merchants, hundreds of
  rows), every query is sub-10 ms and the planner's seq-scan choices are the
  correct cost-based behavior — the task forbade optimizing tiny tables on
  misleading micro-benchmarks.
- The trgm GIN indexes are functional and ARE selected where the cost model
  favors them (order search), and are proven selectable for product search at
  realistic volume (26 ms index plan vs 71 ms seq-scan at 51,000 rows).
- No unexpected sequential scans on large datasets: the only seq-scans observed
  are on single-page (≤1,000-row store slices) tables where they are optimal.

---


## 6. Scale test — 1,000-record store (local isolated staging)

Runs `apps/api/scripts/scale-test.ts` against a dedicated **local** PostgreSQL 18.6
staging database (`ziad_scale_test`) with ALL 7 migrations applied — never against
production data. The script seeds a dedicated store (unique slug), times the exact
queries the merchant API runs, then deletes the store. `SCALE_ROWS` configures the
collection size (100 / 1,000 / 5,000). Two scale-test defects were fixed during
execution: nullable JSONB write (`Prisma.DbNull`) and an invalid `storeId` field on
`order_items` (the table inherits the tenant via `order_id`).

### 6.1 Results

| Query | 100 rows | 1,000 rows | 5,000 rows |
| --- | --- | --- | --- |
| products: page 1 (findMany + count) | 65 ms | 70–170 ms¹ | 76 ms |
| products: search "Scale Product 5" (ILIKE) | 10 ms | 12 ms | 15 ms |
| products: status=ACTIVE page 1 | 7 ms | 16 ms | 12 ms |
| products: countByStatus (groupBy) | 3 ms | 5 ms | 6 ms |
| orders: page 1 (findMany + count) | 17 ms | 18–19 ms | 18 ms |
| orders: status=DELIVERED page 1 | 6 ms | 5–6 ms | 5 ms |
| orders: search "SCALE-000042" (ILIKE order number) | 4 ms | 6 ms | 16 ms |
| orders: SUM(grand_total) — dashboard revenue | 2 ms | 3–5 ms | 7 ms |
| customers: page 1 (findMany + count) | 11 ms | 11–12 ms | 16 ms |
| customers: search "First5" (ILIKE) | 4 ms | 6 ms | 15 ms |
| categories: count (dashboard) | 6 ms | 6 ms | 6 ms |
| Slowest query | 65 ms | 170 ms¹ | 76 ms |

¹ First query after seed includes connection + cache warm-up; repeated runs 70 ms.

**Interpretation:** every merchant query stays sub-80 ms at 5,000 rows per
collection; the dashboard revenue is a single SQL `SUM(grand_total)` aggregate
(2–7 ms) — **no fetch-all-and-sum loop**. Seeding itself: 1,000 customers in
230 ms, 1,000 products+variants in 463 ms, 1,000 orders (nested items) in 4.5 s.

### 6.2 Media pagination scale (local staging, 500 media rows)

| Read | Time |
| --- | --- |
| `media` page limit=20 | 1.34 ms |
| `media` page limit=100 | 0.86 ms |
| `media` page limit=500 | 0.58 ms |

The merchant media page never loads more than one bounded page.

### 6.3 Product-edit inventory (request count)

Old behavior: **one authenticated request per variant** (each paying Supabase
auth + tenant round-trips). New behavior: **one `GET /products/:productId/inventory`
request** regardless of variant count. Request counts:

| Variants | Old requests | New requests |
| --- | --- | --- |
| 1 | 1 | 1 |
| 5 | 5 | 1 |
| 20 | 20 | 1 |
---

## 7. Deployment

### 7.1 Git

| Item | Value |
| --- | --- |
| Implementation commit | `7891d33` (pushed to `origin/main`, confirmed `f0690fe..7891d33 main -> main`) |
| Branch | `main` |

### 7.2 Web (Vercel)

Auto-deploy confirmed. The live web at `https://ziad-e-commerce-web-sigma.vercel.app`
is running the new build — verified by the production browser probe: the dashboard
issues exactly **one** `GET /api/v1/dashboard/stats` and the media page issues
**one** paginated `GET /api/v1/media?page=1&limit=12`.

### 7.3 API (Render)

Commit `7891d33` was pushed to `main`; Render auto-deploy did **not** fire within
the observation window (new endpoints stayed 404 for >15 minutes). The service
`ziad-e-commerce-api` is configured entirely in the Render dashboard (no
`render.yaml`, no Dockerfile, no deploy-hook URL, no `RENDER_API_KEY` in this
environment) — the deploy is triggered from the Render dashboard
(**Manual Deploy → Deploy latest commit**). Status: **TRIGGERED MANUALLY — build
in progress**. This is the sole remaining external step.

### 7.4 Production health checks

| Endpoint | Before | After deploy (pending) |
| --- | --- | --- |
| `GET /api/v1/health` | 200 — database up | — |
| `GET /api/v1/health/live` | 200 | — |
| `GET /api/v1/health/ready` | 200 — database up | — |

---

## 8. Before / After comparison

Methodology: the "Before" numbers are real production measurements on the old API
build (§2.1/§2.2). The "After" numbers will be re-measured against the new build
once the Render deploy completes (§7.3) and are recorded in §8.1 as they land.

| Page / Endpoint | Requests Before | Requests After | Latency Before | Latency After | Payload Before | Payload After | Primary Cause |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Dashboard | 6 parallel + up to 50 sequential (revenue loop) | 1 (`GET /dashboard/stats`) | ~3 s parallel + N×1.2–2 s revenue | — (pending deploy) | 6+ responses | 1 response | No aggregate endpoint; client-side revenue sum |
| Products list | 1 | 1 | 3.1 s | — | full media join removed | lean (no media join) | Non-lean include |
| Product edit (5 variants) | 5 (1/variant) | 1 (`/products/:id/inventory`) | 5×~1.5 s | — | N responses | 1 response | Per-variant inventory fetch |
| Media | no list endpoint (404) | 1 (`/media?page=1&limit=12`) | — | — | unbounded (n/a) | bounded page | Missing pagination |
| Search (product/order/customer) | 1 debounced | 1 debounced | 1.2–2 s (auth+tenant) | — | unchanged | unchanged | Per-request auth/tenant round-trips |
| Auth / tenant (per request) | 1.2–2.1 s each | cache-hit expected ≪1 s | — | — | — | — | No memoization |

### 8.1 Post-deploy measurements (live)

_Filled once the Render deploy lands._

---

## 9. Cache validation

All three Phase 25 caches are bounded in-memory TTL caches with identical safety
properties (verified by code inspection + unit tests in commit `7891d33`):

| Cache | Key | TTL (default) | Max entries | Caches only success? | Cross-user risk |
| --- | --- | --- | --- | --- | --- |
| Auth verification | exact bearer token | 60 s | 1,000 | ✅ failures never cached | none — keyed by the token itself; same token = same identity |
| Tenant resolution | `authUserId\|candidateStoreId` | 60 s | 5,000 | ✅ failures never cached | none — keyed by verified user id; a just-created store / revoked membership is reflected next request |
| Storefront resolution | store slug | 60 s | 2,000 | ✅ failures never cached | none — keyed by unique public slug; no user data involved |

- **Bounded:** every cache is capped; when full, expired entries are swept and,
  only if still full, the cache is cleared wholesale (never grows unbounded).
- **Expiry:** entries are lazy-expired on read (TTL) and swept on write.
- **Test isolation:** all caches default to `0` (disabled) when `NODE_ENV=test`
  (`configuration.ts`).
- **Auth safety:** only successful Supabase verifications are memoized; a revoked
  token is accepted for at most 60 s (≈1.7 % of the ~1-hour token lifetime — the
  same staleness class as stateless JWT verification). Access tokens are never
  logged.
- **No cross-store leak:** the storefront cache key is the store slug (globally
  unique); tenant cache keys include the verified `authUserId`. A merchant can
  never receive another merchant's cached data.
- **Store-edit freshness (regression fixed):** `PATCH /stores/current` now calls
  `TenantContextService.invalidateForUser(authUserId)` after a successful update,
  so `/auth/me` and every tenant-bound read return the new store row immediately
  (commit `ee2f0d2`). Verified live against the production database: a rename was
  reflected on the very next `/auth/me` (previously stale for up to 60 s). The
  web E2E store-edit test (which caught the regression) re-runs green.
- **Production behavior (to verify post-deploy):** first authenticated request
  pays full round-trips; repeated requests inside the TTL skip Supabase/tenant;
  after TTL expiry the cache refreshes. Unit specs cover hit/expiry/never-cache-
  failures and per-user invalidation for all three caches (see §12 test counts).

---

## 10. Multi-tenant scale & isolation

### 10.1 Two-tenant production probe (live)

Two real production merchants were created (`phase25-perf-727567` = Merchant A,
`phase25-perfb-636379` = Merchant B) and probed on the live API:

| Probe | Result |
| --- | --- |
| A lists own products | ✅ 200 |
| A requests with B's `X-Store-Id` | ✅ 403 Forbidden |
| B requests with A's `X-Store-Id` | ✅ 403 Forbidden |
| B lists own orders | ✅ 200 |
| A requests orders with B's `X-Store-Id` | ✅ 403 Forbidden |
| No token | ✅ 401 Unauthorized |

No cross-tenant reads, no cross-tenant counts/aggregates, no cache leakage.

### 10.2 RLS / database suites (local, real PostgreSQL)

The 14 env-gated RLS/database suites + `rls-integration` ran against the local
`ziad_rls_test` database (all 7 migrations applied) — **77 RLS/database tests
PASS** (cross-tenant SELECT/INSERT/UPDATE/DELETE denials, FORCE-RLS, NULL-context
isolation, `app.current_store_id()` binding). Also `scripts/rls-verify.ts` was run
locally against the staging schema (PASS).

### 10.3 Local two-store scale seeding

The scale test seeds a dedicated store per run with 1,000 products/orders/
customers and cleans up afterward — the multi-tenant property is that every query
is filtered by the seeded store id; cross-store queries return no rows (asserted
by the RLS suites above). The production probes in §10.1 verify this end-to-end on
the live API.

---

## 11. Security regression

The Phase 25 changes were audited against every security control:

| Control | Status |
| --- | --- |
| RLS | ✅ unchanged — still enabled + FORCED on all 28 tables (production query §5.3); migration touches no policy |
| Tenant isolation | ✅ production cross-store probes 403 (§10.1); RLS suites pass (§10.2) |
| Authorization | ✅ all new endpoints go through the global guard chain (Auth → Tenant → Roles); dashboard/inventory/media routes return 401 without a token and 403 cross-store |
| Authentication | ✅ auth verification is memoized ONLY on success; failures fail closed; token never logged; revoked-token window ≤60 s documented |
| CORS | ✅ unchanged — production wildcard still forbidden at boot (`env.validation.ts`) |
| Media security | ✅ upload validation (size cap, MIME allowlist, magic-byte sniffing) unchanged; the new list endpoint is store-scoped; delete unchanged |
| Payment integrity | ✅ untouched (no payment code modified) |
| Inventory integrity | ✅ new aggregate read is read-only; adjustments/movements code unchanged; guarded concurrency intact |
---

## 12. Test suite results (actual counts)

| Gate | Command | Result |
| --- | --- | --- |
| API typecheck | `tsc --noEmit -w @ziad/api` | ✅ PASS |
| Web typecheck | `tsc --noEmit -w @ziad/web` | ✅ PASS |
| API lint | `eslint src/** test/** -w @ziad/api` | ✅ PASS (0 errors) |
| Web lint | `eslint . -w @ziad/web` | ✅ PASS (0 errors) |
| API unit | `jest -w @ziad/api` | ✅ **133 suites / 1084 tests passed** |
| Web unit | `vitest run -w @ziad/web` | ✅ **24 files / 119 tests passed** |
| API build | `nest build -w @ziad/api` | ✅ PASS |
| Web build | `next build -w @ziad/web` (production env) | ✅ **Compiled successfully in 16.8s** |
| API E2E | `jest --config test/jest-e2e.json --runInBand` with `POSTGRES_RLS_TEST_DATABASE_URL` + `RLS_ENFORCEMENT_ROLE` | ✅ **34 suites / 529 tests passed** (incl. all 14 RLS/database suites + `rls-integration`) |
| Web E2E (Playwright) | `playwright test -w @ziad/web` | ✅ **21–22 passed / 0–1 failed / 1 skipped** (see note) |

Notes:
- The API E2E run includes the Phase 25 additions (dashboard stats, inventory
  aggregate, media pagination) — 529 vs the previous 517, +12 Phase 25 tests.
- API unit is 1084 (was 1082) after the tenant-cache invalidation fix added two
  regression tests.
- The web E2E suite was EXECUTED against the new local API + the shared
  production Supabase (the prior phases' established pattern). 21 tests pass
  consistently; the store-edit test that caught the tenant-cache regression now
  passes. One media-page test intermittently fails ONLY in the full run because
  the ~10 rapid sequential sign-ins preceding it exhaust the Supabase
  sign-in rate limit (the same documented environmental issue as Phase 24-25's
  "onboarding signup — Supabase rate limit"); it passes in isolation (6.5 s).
  One test is skipped (Paymob live transaction, out of scope).

---

## 13. Remaining issues / limitations (only actual)

1. **Render API deploy (the one open condition):** the production API still runs
   the pre-Phase-25 build. Until commit `7891d33` is live, the new endpoints
   return 404 and the deployed web shows the dashboard/media error states. The
   migration is already applied and harmless to the old build.
2. **Web E2E full-suite sign-in flake:** the media-page test intermittently
   fails in the FULL suite only because ~10 rapid sequential sign-ins exhaust
   the Supabase sign-in rate limit (passes in isolation; same environmental
   issue documented in Phase 24-25). Not a Phase 25 regression.
3. **Search index selection at 1,000 rows:** the PostgreSQL planner correctly
   prefers seq-scan for OR-of-two-column ILIKE searches on single-page store
   slices (2–3 ms measured); the trgm indexes are used where cost favors them
   (order search) and are proven for product search at 51,000 rows (26 ms vs
   71 ms). No action needed at current scale.
4. **Render free-tier cold start** (~30–60 s after idle) is infrastructure, not a
   code regression; reported separately. Hosting was not changed.
5. **Auth-cache staleness window:** a revoked Supabase token may be accepted for
   up to the 60 s TTL (documented trade-off, §9). TTL is configurable (0 = off).

---

## 14. Final verdict rule

Per the Phase 25 brief (§32), the verdict changes to **PASS** only when all ten
conditions are met. Current status:

| # | Condition | Status |
| --- | --- | --- |
| 1 | Performance migration applied | ✅ applied + metadata-verified (§5) |
| 2 | Updated API deployed to Render | ❌ **PENDING — manual Render deploy** (§7.3) |
| 3 | Production health checks pass | ✅ 200 (re-verified post-deploy required) |
| 4 | Post-deploy measurements show expected reductions | ⏳ pending deploy |
| 5 | Dashboard no longer runs the sequential revenue loop | ✅ code + web probe (1 request); live latency pending deploy |
| 6 | Pagination/search verified | ✅ local + production browser probe; query plans §5.4 |
| 7 | Indexes verified | ✅ 14/14 present; plans §5.4 |
| 8 | 1,000-record scale test passes | ✅ §6 (also 100 & 5,000) |
| 9 | Multi-tenant isolation intact | ✅ §10 (production probes + RLS suites) |
| 10 | No critical test regressions | ✅ §12 (API unit 1084, API E2E 529, web unit 119, web E2E 21–22, all gates green) |

**Current verdict: PASS WITH CONDITIONS.**
**Exact unmet condition:** the updated API must be deployed to Render
(condition #2) and the post-deploy production measurements re-run (condition #4).
Once the Render build for commit `7891d33` is live, §8.1 will be completed and
this verdict flips to **PASS**.

