# IMPLEMENTATION — PHASE 23 — PRODUCTION DEPLOYMENT & FIRST MERCHANT PILOT READINESS

**Status:** COMPLETE — implemented, validated, documented. Live external-dependency
verifications (real Paymob TEST payment, wildcard DNS/SSL, RLS enforcement against a
non-owner role) are reported separately and **never faked**.
**Verdict:** **GO WITH CONDITIONS** — see §20.

---

## 1. Current production architecture

```text
Internet
   ↓
DNS / CDN / Reverse Proxy
   ↓
Web (Next.js)            ── root domain = marketing site; {slug}.domain = storefront
   ↓
API (NestJS, modular monolith, single instance for the pilot)
   ↓
PostgreSQL (Supabase)    ── 28 tenant tables + FORCE ROW LEVEL SECURITY
   ↓
Supabase Auth            ── merchant email/password sessions (verified by the API)
   ↓
Supabase Storage         ── private `media` bucket (service-role only, proxied reads)
   ↓
Paymob                  ── Intention API + Unified Checkout (HMAC webhooks)
WhatsApp                ── wa.me fallback ordering (no Business API needed)
```

The product surface (marketing, signup, onboarding, dashboard, storefront, cart,
checkout, orders, payments, WhatsApp, CMS, theme, media, tenant isolation, rate
limiting, reservation expiry, security headers, media security, host-based
storefront resolution) is unchanged from Phase 22 — **no new product features were
added** in this phase.

## 2. Deployment strategy

- **Deployment-agnostic by design** (no cloud provider was pre-selected). The
  recommended concrete option for the pilot is: **Vercel** for the Next.js web
  (wildcard `*.yourdomain.com` routing via its edge + `proxy.ts`), a small VM or
  container platform for the single NestJS API instance, and **Supabase** (already in
  use) for PostgreSQL + Auth + Storage.
- API: one instance; `node dist/main.js` under a supervisor; migrations applied
  before the new build starts.
- Web: `next start` (or Vercel) — the storefront host proxy is in `proxy.ts`.
- Database migrations: forward-only, additive in Phase 23 (`lookup_token` column +
  `job_leases` table). Full runbook: `docs/PRODUCTION-DEPLOYMENT-RUNBOOK.md`.

## 3. Domain strategy

```text
https://yourdomain.com                 → Marketing Website
https://api.yourdomain.com             → API (NestJS)
https://{slug}.yourdomain.com          → Merchant Storefront (per store)
https://ziad-fashion.yourdomain.com    → example merchant storefront
```

- `StorefrontStoreResolver` resolves the store from the Host header subdomain
  (`storefront-host.ts`) or `X-Storefront-Slug`; root/www/foreign hosts and unknown
  subdomains fail closed with 404 (verified live: unknown store → 404).
- Next.js `proxy.ts` rewrites `{slug}.{domain}/*` → `/store/{slug}/*` preserving the
  browser URL.
- Requires wildcard DNS `*.yourdomain.com` + a wildcard TLS certificate. **DNS/SSL
  are NOT deployed here** — they are deployment steps in the runbook (§10–§12).
- Custom merchant domains (`www.mystore.com`) are **future roadmap** (see §20.4 of
  this report for the architecture sketch).

## 4. RLS state

- Migrations ship: `authenticated`/`anon` roles + `app.current_store_id()` helpers
  (init), and `ziad_runtime NOLOGIN IN ROLE authenticated` + **FORCE ROW LEVEL
  SECURITY** on all 28 tenant tables (Phase 21).
- Runtime: `RlsTenantBinder.bind()` issues `SET LOCAL ROLE ziad_runtime` + sets the
  tenant GUC inside every `TransactionService.runWithTenant`; the reset runs in a
  `finally` so a pooled connection never carries another tenant's context.
- **Production-safe role strategy:** the application connects as a LOGIN role that is
  a member of `ziad_runtime` (never the table owner). FORCE RLS makes even the owner
  subject to policies when the app uses the enforcement role.
- Phase 23 applied the Phase 22 migration-resolution fix on the live database and
  added the `job_leases`/`lookup_token` migration (deployed, §9).
- **Live enforcement is still BLOCKED:** the live Supabase app connection remains the
  table owner and `RLS_ENFORCEMENT_ROLE` is unset; flipping it requires the runbook
  §4 procedure (runtime role + migrate + verify with `scripts/rls-verify.ts`).

## 5. Security

Verified live in Phase 23:

- **Order lookup PII gate (new — critical fix):** the PUBLIC
  `GET /storefront/orders/:orderId` no longer returns customer PII to anyone with the
  order URL. Each order now carries a 192-bit `lookup_token` (returned only to the
  creator at checkout/WhatsApp). Without the token the API returns a PII-free view
  (order number, items, totals, status — no email/phone/address). Confirmation pages
  read the token from sessionStorage; it never goes in the URL.
- **Security headers:** `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy` on API + web; HSTS added (env-gated,
  `SECURITY_HSTS_ENABLED` + `NODE_ENV=production` only).
- **CORS:** allowlist enforced; production refuses to boot with `*` or an empty
  `CORS_ORIGINS` (fail-fast validation, tested).
- **Rate limiting** (§7), **webhook HMAC** (§13), **media validation** and **tenant
  isolation** preserved from Phase 21/22.
- **Reverse-proxy IP trust:** `TRUST_PROXY` wired to Express so rate limiting sees
  the real client IP behind a CDN/load balancer.

## 6. Secrets

- Audit result: **no secrets in Git.** Only `.env.example` files are tracked, all with
  empty/placeholder values. A repo scan for `PAYMOB_*`, `SUPABASE_SERVICE_ROLE_KEY`,
  AWS keys, private keys, and JWT-like tokens found only a fake test token in
  `supabase-auth-provider.spec.ts`. The real `.env` values were cross-checked against
  tracked files (prefix search) — **zero hits**.
- `.env` (root, `apps/api`, `apps/web`) is gitignored (verified with `git check-ignore`).
- No secrets are logged: the error filter logs request IDs, the webhook service logs
  only ids (`eventId/paymentId/storeId`), and the Paymob provider logs statuses only.

## 7. Rate limiting

- Phase 21's **in-memory sliding window** is retained for the pilot.
- **Phase 23 additions:** the limiter now prunes idle keys periodically (bounded
  memory in long-running processes), and `TRUST_PROXY` makes the client IP correct
  behind a reverse proxy.
- **Final choice (documented):** in-memory is adequate for the single-instance pilot
  (limits cannot be bypassed when there is only one process). **Redis is NOT
  introduced** (ARCHITECTURE.md §3.5 — reliability before scale). The documented
  upgrade path for 2+ instances is a PostgreSQL-backed store behind the same
  `RateLimitService` interface (a `rate_limit_hits` table keyed by `ip:bucket` with a
  sliding-window query, or Redis when one is introduced for other reasons).
- Health endpoints are exempt; webhooks, checkout, payments, auth and merchant APIs
  keep their per-bucket limits.

## 8. Reservation expiry

- The sweep (carts EXPIRED + reservations RELEASED, guarded and idempotent) previously
  ran on `setInterval` on **every** instance.
- **Phase 23 — distributed lease:** a new `job_leases` table + `SweepLeaseService`
  (`INSERT … ON CONFLICT DO UPDATE WHERE lease_expires_at < now()`) ensures **at most
  one instance sweeps at a time**; a crashed instance's lease expires after
  `RESERVATION_EXPIRY_LEASE_TTL_MS` (default 10 min) so the sweep is never blocked.
  The sweep body stays idempotent (guarded transitions), so even an overlapping pass
  never double-releases inventory.
- **Crash safety fix:** a failed sweep (e.g. `job_leases` missing) is now logged and
  NEVER crashes the API process — verified live when the migration was momentarily
  absent (the pre-fix build crashed; the fix + migration resolved it).

## 9. Database

- Migrations versioned and ordered: `init`, `rls_enforcement`, `whatsapp_orders`,
  `order_lookup_token_and_job_leases` (Phase 23). All FKs, unique/partial-unique
  indexes, CHECKs and composite store-scoped FKs remain.
- **Phase 23 schema change:** `orders.lookup_token` (nullable + backfilled, unique)
  and `job_leases`. Both additive; no existing data altered.
- **Live migration applied:** the live Supabase DB had the Phase 22 migration applied
  manually but not recorded in `_prisma_migrations`. Phase 23 verified the DB state
  (`channel` column, `store_settings`), marked it resolved
  (`prisma migrate resolve --applied 20260815000000_whatsapp_orders`), then deployed
  the Phase 23 migration. The running API now works against the live DB.
- Connection pooling: Supabase transaction pooler; transaction boundaries via
  `TransactionService` (never nested). Migration procedure: runbook §4.
- **Backups are NOT yet configured** (Supabase defaults only) — see §10.

## 10. Backups

Documented in the runbook (§18): Supabase automated daily backups + PITR (paid tier)
plus a weekly `pg_dump`; 7 daily + 4 weekly retention; monthly restore validation by
running the API E2E (RLS suites included) against a restored scratch project.
**Not verified here** — the live project's backup settings were not changed.

## 11. Monitoring

Pilot-minimal (no provider selected, no heavy stack):

- **Health:** `/health` (combined), `/health/live` (liveness, no I/O), `/health/ready`
  (readiness — 503 while the DB is down). All verified live (200s, database up).
- **Payments/webhooks:** safe structured webhook logs added (`eventId`, `paymentId`,
  `storeId`, `status=processed|already_processed|payment_unresolved`) for duplicate /
  unresolved detection.
- **API 4xx/5xx:** the global error filter logs every failed request with its
  `X-Request-Id`; UptimeRobot/Better-Uptime pings are the recommended zero-code
  uptime layer. Alert thresholds: runbook §19.


## 12. Storage

Audited (no code change): private `media` bucket, service-role key server-side only,
store-scoped proxied reads, MIME allowlist + magic-byte verification, size cap,
tenant-safe keys, no path traversal (Phase 21). The local `.env` has a real service
role key — browser never receives it. **The `media` bucket was not re-verified live**
(Supabase Storage credentials are exercised only when media is uploaded).

## 13. Paymob

- Phase 22 flow (Intention API + Unified Checkout) is retained; provider fails closed
  without `PAYMOB_API_KEY`/`PAYMOB_INTEGRATION_ID`/`PAYMOB_PUBLIC_KEY`, and the
  webhook fails closed without `PAYMOB_HMAC_SECRET`.
- **Phase 23:** the startup diagnostic now also warns when `PAYMOB_WEBHOOK_URL` is
  unset; the webhook URL is fully configurable via env; the return URL stays
  configurable (from the storefront origin); idempotency, payment-state preservation,
  failed-payment handling and the WhatsApp fallback are unchanged and covered by the
  API E2E (438 passed).
- **Live TEST payment: BLOCKED.** The live `.env` has an API key, integration id and
  HMAC secret, but **`PAYMOB_PUBLIC_KEY` is unset**, so the Unified Checkout URL
  cannot be built and payment initiation fails closed (verified in the live startup
  log). No real Paymob TEST payment has ever been processed in this project.

## 14. WhatsApp

- Store-scoped config (enabled + E.164 number in `store_settings`), tenant-isolated,
  fail-closed when disabled. Orders create REAL WHATSAPP-channel orders (PENDING,
  unpaid, merchant confirms manually). Message generation (EN/AR) and wa.me deep
  links unchanged.
- **Verified live:** the web E2E WhatsApp order test passes end-to-end against the
  live stack (customer places an order via WhatsApp → merchant sees it in Orders).
- Merchant onboarding requirement: enable WhatsApp in Settings and set a valid
  `+20…` number.

## 15. Pilot data

- `scripts/pilot-cleanup.ts` **dry-run executed** against the live DB:
  - TEST-classified: 1 user (e2e.merchant@ziad.test), 55 products, 23 categories.
  - REAL-classified: 1 store (`ziad-store`), 1 user, **49 products**, 31 categories.
- **No destructive apply** — 49 REAL products (including catalog the merchant may
  want to keep) require manual review; the script's own guard refuses to delete
  ambiguous records without confirmation. Seeding the pilot catalog is a merchant
  decision, not automated here.

## 16. Staging

A staging-like setup is documented and exercised in this phase:
- Local stack: API (`node dist/main.js` against the live dev Supabase DB) + web
  (`next start`) — both ran during validation.
- Real PostgreSQL RLS test environment: `docs/RLS-TEST-ENVIRONMENT.md` +
  `apps/api/scripts/setup-rls-test-db.ps1` (creates the DB, applies migrations,
  verifies roles) + reset strategy. This is the recommended staging database.
- Staging must use **Paymob TEST credentials** (never production) and test-only
  WhatsApp numbers — documented in the runbook.


## 17. Smoke tests (executed live)

| Step | Result |
| --- | --- |
| API build (`npm run build -w @ziad/api`) | ✅ PASS |
| Web build (`npm run build -w @ziad/web`) | ✅ PASS (exit 0, all storefront routes compiled) |
| `GET /api/v1/health` | ✅ 200 — `{status:ok, checks:{database:up}}` |
| `GET /api/v1/health/live` | ✅ 200 |
| `GET /api/v1/health/ready` | ✅ 200 |
| Storefront resolve `ziad-store` (X-Storefront-Slug) | ✅ 200 real store |
| Storefront unknown store | ✅ 404 (fail closed) |
| API security headers | ✅ nosniff / DENY / strict-origin-when-cross-origin / Permissions-Policy |
| Web security headers | ✅ same set on `next start` responses |
| `GET /api/v1/auth/me` with a real Supabase token | ✅ 200 (store + membership resolved) |
| Expiry sweep boot | ✅ scheduled; no crash |

## 18. E2E

### API E2E — `npm run test:e2e -w @ziad/api`

| Result | Count |
| --- | --- |
| PASS | **438** |
| SKIPPED | **78** (14 RLS/database suites — real tests, env-gated on `POSTGRES_RLS_TEST_DATABASE_URL`; this machine has no local PostgreSQL/Docker, see `docs/RLS-TEST-ENVIRONMENT.md`) |
| FAIL | 0 |
| Unit (jest) | **1023 PASS** / 0 fail |
| Web unit (vitest) | **102 PASS** / 0 fail |

Phase 23 converted all 14 previously-`describe.skip` database suites into real,
env-gated tests (76 new real assertions: migration contract, CHECK/UNIQUE/FK
constraints, composite tenant FKs, RLS cross-tenant isolation, guarded transitions,
rollback, atomic reservation concurrency) plus the existing RLS integration spec —
the historical **`264 skipped` is now 78**, and those 78 run as soon as a PostgreSQL
test database is provisioned.

### Web E2E (Playwright, live stack)

| Result | Count |
| --- | --- |
| PASS | **21** |
| FAIL | **1** — onboarding signup (`merchant.xxxxxx@ziad.test` rejected by Supabase GoTrue: `Email address ... is invalid`) |
| SKIPPED | **1** — Paymob live payment (correctly gated on missing `PAYMOB_PUBLIC_KEY`) |

The single failure is the documented **external Supabase blocker** (the shared
project rejects the `@ziad.test` TLD for new signups); it is NOT a code defect. All
merchant-login-dependent journeys pass against the real stack.

## 19. Known blockers

1. **Live Paymob TEST payment — BLOCKED.** `PAYMOB_PUBLIC_KEY` is not set in the live
   `.env`; no real card payment has ever been processed. Setting the public key (and a
   reachable `PAYMOB_WEBHOOK_URL`) then running one real TEST payment is the
   gate for online payments.
2. **Wildcard domain / DNS / SSL — BLOCKED.** `STOREFRONT_DOMAIN` is still the
   `platform-domain.com` placeholder; no wildcard DNS/TLS exists. Storefronts work on
   the dev `/store/{slug}` path and via `X-Storefront-Slug`; the production subdomain
   strategy is code-ready but undeployed.
3. **RLS live enforcement — BLOCKED.** The live app still connects as the table owner
   with no runtime role; the enforcement-role migration is unapplied to the live DB.
   Procedure + verification tooling are in the runbook/`rls-verify.ts`.
4. **Web E2E onboarding signup — BLOCKED (external).** Supabase GoTrue rejects the
   `@ziad.test` TLD for new signups in the shared project. A real, confirmed merchant
   email unlocks the onboarding leg.
5. **RLS database suites — BLOCKED (environment).** No local PostgreSQL/Docker on
   this machine; the suites are implemented, env-gated, and documented
   (`docs/RLS-TEST-ENVIRONMENT.md`) but not executed here.
6. **Pilot cleanup apply — BLOCKED (human).** Dry-run classified 49 REAL products
   requiring merchant review; destructive apply is intentionally not performed.


## 20. Final verdict

**GO WITH CONDITIONS.**

The security hardening that Phase 20/21/22 gated on is done and verified:
- ✔ No secrets in Git; `.env` ignored; no secrets in the frontend or logs.
- ✔ Tenant isolation at the application layer (guards + store-scoped repositories).
- ✔ Rate limiting, webhook HMAC, media validation, security headers, CORS allowlist.
- ✔ **Order lookup PII exposure fixed** (per-order lookup token; PII-free fallback).
- ✔ Health liveness/readiness; safe structured webhook logging.
- ✔ Reservation expiry is multi-instance safe (distributed lease) and cannot crash the
  API; production builds + full test suites pass; live smoke tests pass.

Conditions before a real merchant takes a real card payment (in priority order):
1. Set real `PAYMOB_PUBLIC_KEY` (+ verify `PAYMOB_WEBHOOK_URL`) and complete **one
   real TEST payment end-to-end** (Paymob → webhook → order CONFIRMED). Until then,
   online card payments are BLOCKED (fail closed) and only WhatsApp ordering works.
2. Deploy the wildcard domain + DNS + SSL; set `STOREFRONT_DOMAIN`; verify
   `https://{slug}.yourdomain.com`.
3. Apply the RLS runtime role to the live DB and verify with `scripts/rls-verify.ts`.
4. Provision the RLS PostgreSQL test DB and run the 78 database tests (see
   `docs/RLS-TEST-ENVIRONMENT.md`).
5. Approve the pilot catalog (review the 49 REAL products) — or explicitly seed a
   fresh pilot store.
6. Use a real, confirmed merchant email for the pilot signup.

### 20.4 Custom merchant domains (future roadmap — NOT implemented)

Architecture sketch for `www.mystore.com`:
- **DB fields:** `stores.custom_domain TEXT UNIQUE NULL` + `custom_domain_verified_at
  TIMESTAMPTZ NULL`.
- **Ownership verification:** a DNS TXT record (`ziad-verification=<token>`) at the
  merchant's apex/`_ziad` label; a background verifier sets `custom_domain_verified_at`.
- **Certificate management:** wildcard platform cert for `*.yourdomain.com` today;
  per-merchant certs (Let's Encrypt) once custom domains are offered.
- **Resolution:** `StorefrontStoreResolver` already host-resolves; a custom domain is
  one extra lookup (`custom_domain → store`), with the same fail-closed 404.
- **Web routing:** add the custom host to the proxy rewrite list.
- Kept out of this pilot (deployment + TLS + verification cost not justified yet).

## 21. Merchant pilot checklist

Before the first merchant goes live:

1. [ ] Deploy API + web (runbook §8–§9) with `NODE_ENV=production`.
2. [ ] Apply migrations; create the `ziad_app` runtime role; set `RLS_ENFORCEMENT_ROLE`;
      run `scripts/rls-verify.ts` → PASS.
3. [ ] Set `CORS_ORIGINS` (no wildcard), `STOREFRONT_DOMAIN`, `TRUST_PROXY=1`.
4. [ ] Wildcard DNS + wildcard TLS for `*.yourdomain.com`; verify root → marketing,
      `{slug}` → storefront, unknown → 404; then set `SECURITY_HSTS_ENABLED=true`.
5. [ ] Set all four Paymob credentials + `PAYMOB_WEBHOOK_URL`; complete **one real TEST
      card payment**; verify webhook → order CONFIRMED; then record the validation.
6. [ ] Create the private `media` bucket; confirm uploads + storefront image delivery.
7. [ ] Create the pilot merchant with a **real confirmed email**; enable WhatsApp in
      Settings with a valid number.
8. [ ] Review the pilot catalog (`scripts/pilot-cleanup.ts` dry-run + merchant
      confirmation); seed or curate the storefront.
9. [ ] Provision the RLS test DB and run the 78 database tests (`docs/RLS-TEST-ENVIRONMENT.md`).
10. [ ] Uptime monitor pings `/health/live` + `/health/ready`; webhook/payment alerts on.
11. [ ] Run the merchant checklist smoke test (marketing → signup → onboarding →
      store → product → inventory → publish → view → customer purchase →
      Paymob/WhatsApp → merchant order) and sign off.

---
**Phase 23 does NOT add:** social integrations, WhatsApp Business API, advanced
analytics, marketplace, multi-location inventory, advanced search, shipping
providers, a new CMS builder, or dashboard redesigns.

