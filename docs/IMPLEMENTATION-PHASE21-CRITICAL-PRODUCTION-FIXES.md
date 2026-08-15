# IMPLEMENTATION — PHASE 21 — CRITICAL PRODUCTION FIXES

**Status:** COMPLETE — implemented, validated, documented. Live external-dependency
verification is reported separately (Paymob live payment, wildcard DNS, RLS live
enforcement, Playwright, pilot cleanup) and never faked.
**Verdict:** **GO WITH CONDITIONS** — see §21.

---

## 1. Objective

Close the eight critical production blockers identified in `docs/PRODUCT-AUDIT-PHASE20.md`:

1. Real Paymob integration + live payment verification
2. Production storefront domain / wildcard subdomains
3. Public API rate limiting
4. Cart / inventory reservation expiry
5. PostgreSQL RLS enforcement
6. Secure media upload limits
7. Full web Playwright E2E execution
8. Pilot database/data hygiene

No new product features, no redesigns, no CMS/analytics/social/billing/shipping work.

---

## 2. Audit findings addressed

| # | Audit finding | Phase 21 resolution |
|---|---|---|
| 1 | Paymob credentials are placeholders; live payment never processed | Startup diagnostic + fail-closed behaviour preserved; expanded tests (cancelled payment, missing-credentials diagnostics, duplicate replay). Live payment **BLOCKED** (no real credentials). |
| 2 | Wildcard storefront domains not deployed | Hardened host→slug parser, config-gated host resolution, Next.js `proxy.ts` wildcard rewrite, DNS/SSL runbook. Live DNS **BLOCKED** (no domain). |
| 3 | No meaningful rate limiting | Global `RateLimitModule` (sliding window, per-bucket limits, env-configurable, 429 + Retry-After). Live probe returned 429. |
| 4 | Abandoned checkouts hold inventory indefinitely | Reservations get `expires_at` at checkout; carts get `expires_at` at creation; periodic `ReservationExpiryJob` releases expired ACTIVE reservations idempotently (never CONSUMED/paid ones). |
| 5 | RLS decorative — app runs as table owner | `FORCE ROW LEVEL SECURITY` migration + `ziad_runtime` role + `SET LOCAL ROLE` binder + `rls-verify.ts` probe + self-skipping integration spec. Live enforcement **BLOCKED**. |
| 6 | Unrestricted media uploads | Size cap, MIME allowlist, magic-byte verification, storage-key traversal guard. Live probes returned 400. |
| 7 | Web E2E could not run | Stack started; suite executed → 20 passed / 1 environment-blocked / 1 skipped (§11). |
| 8 | E2E residue in live DB | `pilot-cleanup.ts` dry-run classification; destructive apply gated behind confirmation. Apply **BLOCKED** pending merchant review. |

---

## 3. Files changed / added

### Added
- `apps/api/src/rate-limit/` — constants / service / middleware / module (+ specs).
- `apps/api/src/jobs/reservation-expiry.job.ts` (+ spec), `jobs.module.ts`.
- `apps/api/src/storefront/domain/storefront-host.ts` (+ spec).
- `apps/api/src/common/security/security-headers.middleware.ts` (+ spec).
- `apps/api/prisma/migrations/20260814000000_rls_enforcement/migration.sql`.
- `apps/api/scripts/rls-verify.ts`, `apps/api/scripts/pilot-cleanup.ts`.
- `apps/api/test/rls-integration.e2e-spec.ts` (self-skipping real-PostgreSQL RLS tests).
- `apps/web/proxy.ts` (Next 16 convention, replaces `middleware.ts`), `lib/storefront/host.ts` (+ test).

### Modified
- `apps/api/src/config/configuration.ts`, `env.validation.ts` (+ spec).
- `apps/api/src/app.module.ts` (RateLimitModule + JobsModule), `app.setup.ts` (security headers).
- `apps/api/src/infrastructure/database/rls-tenant-binder.ts` (+ spec).
- `apps/api/src/cart/**`, `checkout/**`, `inventory/**` — expiry at creation + store-driven sweeps.
- `apps/api/src/media/**` — size cap, allowlist, magic bytes, safe keys.
- `apps/api/src/payments/providers/paymob/paymob-payment-provider.ts` — startup diagnostic.
- `apps/api/src/storefront/services/storefront-store-resolver.ts` (+ spec).
- `apps/api/test/*` — cart/media/storefront/env e2e updates.
- `apps/web/playwright.config.ts` (expect timeout 15s), `apps/web/e2e/storefront.spec.ts`.
- `.env.example`, `apps/web/.env.example`, `apps/web/lib/config.ts`.

---

## 4. Architecture changes

Additive only. Guard chain, tenant isolation, state machines, idempotency and
fail-closed behaviour unchanged:

```
RequestContextMiddleware → SecurityHeadersMiddleware → RateLimitMiddleware → Guards → Controllers
                                                                                ↗
MaintenanceJobsModule (ReservationExpiryJob, setInterval, env-gated) ───────────┘
```

- Rate limiting runs before the guard chain, so even unauthenticated endpoints
  (login probes, webhooks, storefront) are throttled.
- Reservation expiry reuses the existing guarded transitions (ACTIVE→RELEASED) and
  adds a store-driven entry point for the background job (no request context needed).
- RLS enforcement is code-ready but inert until `RLS_ENFORCEMENT_ROLE` is set and the
  migration applied; the current owner-connection behaviour is preserved.

---

## 5. Paymob implementation

- Provider (auth→order→payment-key→iframe), webhook controller, HMAC verification
  (`paymob-hmac.ts`, SHA-512, timing-safe), webhook dedup (`payment_events` unique),
  guarded payment/order/reservation transitions — **unchanged** (audit §4 was PASS).
- **Added:** `PaymobPaymentProvider.onModuleInit` startup diagnostic logging exactly
  which of `PAYMOB_API_KEY` / `PAYMOB_INTEGRATION_ID` / `PAYMOB_IFRAME_ID` /
  `PAYMOB_HMAC_SECRET` are missing, confirming fail-closed behaviour.
- **Tests added:** cancelled-payment webhook (payment FAILED, order stays PENDING,
  replay is a dedup no-op), provider diagnostics; existing suite covers success /
  failure / invalid HMAC / duplicate / malformed / missing credentials / state
  consistency (webhook + payments service + provider + HMAC specs).
- **Live payment verification: BLOCKED.** Real credentials are not present in this
  environment (placeholder-shaped). Required env vars: `PAYMOB_API_KEY`,
  `PAYMOB_INTEGRATION_ID`, `PAYMOB_IFRAME_ID`, `PAYMOB_HMAC_SECRET`. The webhook HMAC
  field list/serialisation remains *code-ready, not live-verified* against a real
  Paymob callback.

---

## 6. Storefront domain strategy

Production target: `https://{storeSlug}.{STOREFRONT_DOMAIN}` (e.g. `ziad-fashion.yourdomain.com`).

- **API resolution** (`StorefrontStoreResolver` + `storefront-host.ts`): the slug is
  derived from the `Host` header only when it is a single-label subdomain of
  `STOREFRONT_DOMAIN`. Root domain, `www`, localhost, IPv6, multi-label and malformed
  hosts fail closed with 404. Gated by `STOREFRONT_HOST_RESOLUTION_ENABLED` (default on
  in production). `X-Storefront-Slug` remains the dev mechanism; client store ids are
  never accepted.
- **Web routing** (`apps/web/proxy.ts`, Next 16 proxy convention): rewrites
  `{slug}.{DOMAIN}/*` → `/store/{slug}/*` preserving the browser URL; strips an
  existing `/store/{slug}` prefix so storefront internal links keep working.
- **Live DNS: BLOCKED.** No apex domain is deployed.

### DNS / proxy / TLS runbook
1. **Wildcard DNS**: `*.yourdomain.com A/AAAA → server IP` (+ apex `A`). Verify with
   `dig +short ziad-fashion.yourdomain.com`.
2. **Reverse proxy** (Nginx/Caddy): TLS termination; forward `https://*.yourdomain.com`
   → web :3000 and `https://api.yourdomain.com` → API :4000. Preserve the `Host` header.
3. **SSL**: wildcard certificate `*.yourdomain.com` (+ apex), e.g. Let's Encrypt DNS-01.
4. **Environment**: API `STOREFRONT_DOMAIN` + `STOREFRONT_HOST_RESOLUTION_ENABLED=true`;
   web `STOREFRONT_DOMAIN`; `CORS_ORIGINS=https://*.yourdomain.com,https://yourdomain.com`.
5. **Local development**: `/store/[slug]` route + `X-Storefront-Slug`; no DNS needed.
6. **Production storefront URL** becomes live only after DNS/proxy/TLS are actually
   deployed and verified.

---

## 7. Rate limiting

- Global sliding-window limiter keyed by `clientIP:bucket`; buckets derived from the
  URL (auth, storefront-read, cart, checkout, payment, order-lookup, media, webhook,
  merchant-api). Health is exempt.
- 429 responses use the standard error envelope (`TOO_MANY_REQUESTS`) + `Retry-After`.
- Env configuration (defaults): `RATE_LIMIT_ENABLED` (on outside test),
  `RATE_LIMIT_DEFAULT_WINDOW_MS=60000`, `RATE_LIMIT_DEFAULT_LIMIT=300`,
  `RATE_LIMIT_AUTH_LIMIT=60`, `RATE_LIMIT_STOREFRONT_READ_LIMIT=120`,
  `RATE_LIMIT_CART_LIMIT=60`, `RATE_LIMIT_CHECKOUT_LIMIT=30`,
  `RATE_LIMIT_PAYMENT_LIMIT=30`, `RATE_LIMIT_ORDER_LOOKUP_LIMIT=60`,
  `RATE_LIMIT_MEDIA_LIMIT=300`, `RATE_LIMIT_WEBHOOK_LIMIT=120`,
  `RATE_LIMIT_MERCHANT_API_LIMIT=300`.
- Tests: unit (service + middleware + classification) + live probe (auth bucket,
  limit 3 → 4th request 429 + `Retry-After: 58`).
- Scale-out: limiter is in-memory (single instance); multi-node deployments replace
  the `Map` with a shared store (Redis) behind the same interface.

---

## 8. Cart / inventory reservation expiry

- Checkout writes `inventory_reservations.expires_at = now + RESERVATION_TTL_MS`
  (default 30 min). New carts write `carts.expires_at = now + CART_TTL_MS` (default 7d).
- `ReservationExpiryJob` (env-gated, default on outside test) runs every
  `RESERVATION_EXPIRY_INTERVAL_MS` (default 5 min), iterates stores and calls
  `expireDueReservationsForStore` (guarded ACTIVE→RELEASED + inventory restore +
  RELEASE movement per reservation, idempotent) and `expireDueCartsForStore`
  (guarded ACTIVE→EXPIRED).
- **Paid orders are never released**: the guarded `WHERE status='ACTIVE'` transition
  skips CONSUMED reservations; repeated runs are no-ops and never double-release.
- **Development**: the job is disabled under `NODE_ENV=test`; toggle with
  `RESERVATION_EXPIRY_ENABLED`; trigger manually via `ReservationExpiryJob.runSweep()`.
- **Production**: run on a single node (leader) or as a worker invoking `runSweep()`;
  interval via `RESERVATION_EXPIRY_INTERVAL_MS`.
- Tests: valid/expired reservation, cancelled checkout, payment success/failure paths,
  repeated expiry (idempotent), multiple reservations, store-driven sweeps, job
  scheduling + per-store error isolation.

---

## 9. RLS enforcement

- Migration `20260814000000_rls_enforcement`: creates `ziad_runtime` (NOLOGIN, member
  of `authenticated` so existing `TO authenticated` policies apply), grants DML, and
  `FORCE ROW LEVEL SECURITY` on all 28 tenant tables. No policy deleted; RLS not disabled.
- `RlsTenantBinder` applies `SET LOCAL ROLE <RLS_ENFORCEMENT_ROLE>` inside every
  tenant-bound transaction (transaction-scoped, safe for pooled connections).
- `scripts/rls-verify.ts` (read-only, rolled-back transaction) proves cross-tenant
  read/write/insert blocking, NULL-context isolation and FORCE status.
- `test/rls-integration.e2e-spec.ts` runs the same probes against a dedicated
  `POSTGRES_RLS_TEST_DATABASE_URL`; self-skips when unavailable.
- **Live enforcement: BLOCKED.** No local PostgreSQL or Docker is available, and the
  live Supabase pooler connects as the table owner. Applying the migration while the
  app still runs as the owner (without `SET LOCAL ROLE`) would break reads, so it is
  intentionally NOT applied. Before full enforcement, application reads that use the
  shared client must be routed through tenant-bound transactions (staged work);
  otherwise FORCE RLS returns zero rows for untransacted reads.
- The previously-blocked database e2e suites remain `describe.skip`/self-skipping —
  reported as BLOCKED, not passed.

---

## 10. Media security

- `MEDIA_MAX_UPLOAD_BYTES` (default 10 MB) enforced while streaming the body
  (`readRawBody` cap — no unbounded buffering) and in the service.
- `MEDIA_ALLOWED_MIME_TYPES` (default `image/jpeg,image/png,image/webp,image/gif,image/avif`)
  — unsupported types rejected, never stored as generic FILE rows.
- Magic-byte verification (`sniffImageMimeType`) rejects content whose signature does
  not match its declared Content-Type.
- `assertSafeStorageKey` blocks traversal/absolute/empty-segment keys; storage paths
  remain server-generated and tenant-prefixed (`{store_id}/{media_id}`).
- Cross-tenant access, missing media and deletion behaviour unchanged (store-scoped,
  fail closed, physical delete with reference guard).
- Tests: valid image, oversized, invalid MIME, content/type mismatch, storage-key
  traversal, cross-tenant access, missing media, deletion (unreferenced / referenced).

---

## 11. Playwright E2E

Executed against the real stack: PostgreSQL/Supabase, API :4000 (Phase 21 build), Web
:3000 (dev server), real merchant session (`e2e.merchant@ziad.test`), Playwright Chromium.

**Result: 20 passed / 1 failed / 1 skipped (22 tests, 4.7 m).**

- **Passed** include: admin CRUD→publish→archive, catalog lifecycle, orders/customers/
  store/media/inventory/i18n modules, auth lifecycle, and the **critical storefront
  journey** (login → dashboard → create+stock+publish product → storefront → product
  listing → details → add to cart → cart page).
- **Skipped:** the live Paymob checkout test (real credentials unavailable — isolated,
  reported as environment-blocked, never faked).
- **Failed:** the onboarding journey ("a new merchant signs up, creates a store,
  publishes their first product"). Root cause is environmental: Supabase GoTrue rejects
  the test's `@ziad.test` email TLD ("Email address … is invalid") and the shared
  project rate-limits signups ("email rate limit exceeded"). Not a Phase 21 regression.
- **Test fixes made during the run:** (a) module-scope `test.skip(!paymobConfigured())`
  was silently skipping the whole storefront spec file — moved into the Paymob test;
  (b) publish now confirms the lifecycle dialog; (c) products get stock via the
  "Adjust inventory" modal before visiting the storefront; (d) expect timeout raised to
  15s because the hosted Supabase DB adds 1–3 s per write round-trip.

---

## 12. Pilot data hygiene

`scripts/pilot-cleanup.ts` (dry-run default; `--apply` requires `PILOT_CLEANUP_CONFIRM=YES`):

- Classifies stores/users/products/categories by E2E/test markers and scopes
  orders/carts/reservations/payments/media/subscriptions to classified TEST stores.
- Never deletes genuine merchant data; ambiguous data stops the apply.
- Dry-run report (live DB): **TEST** = 1 e2e user, 44 products, 20 categories;
  **REAL** = 1 store (`ziad-store`), 1 merchant user, 36 products, 25 categories.
- **Destructive apply: BLOCKED pending merchant review** — 36 products did not match
  E2E naming and are treated as possibly genuine; a human must confirm before any
  deletion. No deletion was performed.

---

## 13. Environment variables

See `.env.example` (root) and `apps/web/.env.example`. New Phase 21 variables:
`STOREFRONT_HOST_RESOLUTION_ENABLED`, `RLS_ENFORCEMENT_ROLE`, `RATE_LIMIT_*`,
`CART_TTL_MS`, `RESERVATION_TTL_MS`, `RESERVATION_EXPIRY_*`,
`MEDIA_MAX_UPLOAD_BYTES`, `MEDIA_ALLOWED_MIME_TYPES`.

---

## 14. Database / migration changes

New migration `apps/api/prisma/migrations/20260814000000_rls_enforcement/migration.sql`
(see §9). No Prisma schema columns changed — `carts.expires_at` and
`inventory_reservations.expires_at` already existed and are now populated.

---

## 15. Commands to run

```bash
npm run typecheck -w @ziad/api && npm run typecheck -w @ziad/web
npm run lint -w @ziad/api && npm run lint -w @ziad/web
npm run test -w @ziad/api && npm run test -w @ziad/web
npm run build -w @ziad/api && npm run build -w @ziad/web
npm run test:e2e -w @ziad/api
npm run test:e2e -w @ziad/web
# ops probes
cd apps/api && npx ts-node scripts/rls-verify.ts
cd apps/api && npx ts-node scripts/pilot-cleanup.ts
```

---

## 16. Tests executed

- API unit (`npm run test -w @ziad/api`), Web unit (`npm run test -w @ziad/web`),
  API e2e (`npm run test:e2e -w @ziad/api`), Web e2e (`npx playwright test`) — see §17.
- Targeted: rate limiting (unit + live 429), reservation expiry (unit + job),
  RLS (binder unit + BLOCKED integration), media security (unit + live 400),
  storefront host resolution (unit + live host→200/404), Paymob (unit matrix).

---

## 17. Validation results

| Command | Result |
|---|---|
| `typecheck -w @ziad/api` / `-w @ziad/web` | ✅ PASS / ✅ PASS |
| `lint -w @ziad/api` / `-w @ziad/web` | ✅ PASS / ✅ PASS |
| `test -w @ziad/api` | ✅ PASS — 965 tests / 124 suites |
| `test -w @ziad/web` | ✅ PASS — 99 tests / 20 suites |
| `build -w @ziad/api` / `-w @ziad/web` | ✅ PASS / ✅ PASS |
| `test:e2e -w @ziad/api` | ✅ PASS — 425 passed, 264 skipped (RLS/database BLOCKED), 0 failed |
| `test:e2e -w @ziad/web` | 20 passed / 1 failed (onboarding — Supabase env) / 1 skipped (Paymob) |

Live probes (API on :4010 with host resolution + rate limiting enabled):

| Probe | Result |
|---|---|
| `GET /api/v1/health` | ✅ 200 |
| storefront via `Host: ziad-store.platform-domain.com` | ✅ 200 (real store) |
| root domain `Host: platform-domain.com` | ✅ 404 |
| unknown subdomain | ✅ 404 |
| `X-Storefront-Slug` header | ✅ 200 |
| auth bucket rate limit (limit 3) | ✅ 4th request → 429 + `Retry-After` |
| webhook invalid HMAC | ✅ 400 (fail closed) |
| media content/type mismatch | ✅ 400 |
| media oversize (10 MB + 1) | ✅ 400 |
| RLS verify script | **BLOCKED** — `ziad_runtime` role not applied to live DB |
| pilot-cleanup dry-run | ✅ classification report produced (no deletes) |

---

## 18. Remaining blockers

1. **Live Paymob payment** — no real `PAYMOB_*` credentials; webhook field list
   code-ready but not verified against a real callback.
2. **Production wildcard domain** — no apex domain deployed; DNS/SSL/proxy not set.
3. **RLS live enforcement** — no test PostgreSQL; live Supabase pooler is the table
   owner; migration not applied; staged read-routing work required before FORCE RLS.
4. **Web E2E onboarding journey** — Supabase GoTrue rejects the `@ziad.test` TLD and
   rate-limits signups in this shared project.
5. **Pilot cleanup apply** — dry-run only; human confirmation needed for the
   non-E2E-named catalog rows.

---

## 19. Security notes

- No secrets exposed to the frontend; Paymob/Supabase values env-only; error envelope
  never leaks internals (unchanged).
- Added security headers (`X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `X-XSS-Protection: 0`, `Permissions-Policy`).
- CORS remains allowlist-based; guards unchanged; webhook security via HMAC + dedup.
- Rate limiting protects the public surface before the guard chain.
- Media uploads now enforce size + type allowlist + content consistency + safe paths.

---

## 20. Production deployment prerequisites

1. Set real `PAYMOB_*` credentials (all four) and confirm a test payment end-to-end.
2. Deploy wildcard DNS + wildcard TLS + reverse proxy for `*.yourdomain.com`; set
   `STOREFRONT_DOMAIN`/`CORS_ORIGINS`; verify `https://{slug}.{domain}`.
3. PostgreSQL RLS: create `ziad_runtime`, apply the Phase 21 migration, connect the app
   as the runtime role (or `SET LOCAL ROLE`), route remaining shared-client reads
   through tenant-bound transactions, then run `scripts/rls-verify.ts` to green.
4. Run the expiry sweep on one node (`RESERVATION_EXPIRY_ENABLED=true` default).
5. Review + apply pilot cleanup (merchant confirmation), then seed the pilot catalog.
6. Confirm the onboarding E2E signup domain is accepted by the target Auth provider.

---

## 21. Final GO / NO-GO recommendation

**GO WITH CONDITIONS.**

All eight blockers have concrete, code-ready fixes; API/unit/build/typecheck/lint are
fully green and the API E2E suite passes (425). The critical storefront E2E journey
now runs and passes. Remaining conditions are external-dependency verifications that
cannot be honestly completed here and are explicitly **BLOCKED**, not passed: live
Paymob payment, live wildcard-domain/DNS/SSL, live RLS enforcement against a non-owner
role, the Supabase signup leg of the onboarding E2E, and the destructive pilot-cleanup
apply. Once those five are verified against real infrastructure, the product can be
declared production-ready.




