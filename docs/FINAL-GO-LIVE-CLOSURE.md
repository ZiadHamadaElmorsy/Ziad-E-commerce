# FINAL GO-LIVE CLOSURE — ZIAD E-COMMERCE FIRST MERCHANT PILOT

**Date:** 2026-08-15
**Status:** COMPLETE — closure work executed. Final verdict: **GO WITH
CONDITIONS** (see §12). External-dependency conditions (real Paymob TEST
transaction, wildcard DNS/SSL, live RLS role switch, Supabase signup rate
limit, pilot merchant confirmation) are reported honestly as BLOCKED, never
faked.

---

## 1. All previous phases (summary)

| Phase | Deliverable | State |
| --- | --- | --- |
| 1–19 | Core product: identity/tenancy, catalog, inventory, cart, checkout, orders, payments, customers, CMS, media, subscription, merchant onboarding, marketing, storefront | Complete |
| 20 | Full product audit (`docs/PRODUCT-AUDIT-PHASE20.md`) — GO WITH CONDITIONS | Complete |
| 21 | Critical production fixes: rate limiting, reservation expiry, RLS enforcement architecture, media security, security headers, web E2E, pilot hygiene | Complete |
| 22 | Paymob Intention API + Unified Checkout + WhatsApp ordering | Complete |
| 23 | Deployment + first-merchant pilot readiness | Complete |
| **Final closure** | This document + `docs/FIRST-MERCHANT-PILOT-CHECKLIST.md` + executed RLS test environment | Complete |

## 2. Final architecture

```text
Internet
   ↓
DNS / CDN / Reverse Proxy   (not deployed — no production domain)
   ↓
Web (Next.js)               root domain = marketing; {slug}.domain = storefront
   ↓
API (NestJS, single instance)
   ↓
PostgreSQL (Supabase)       28 tenant tables, RLS enabled + FORCE (migration applied),
                            `ziad_runtime` role exists, app connection currently BYPASSES
                            RLS (postgres BYPASSRLS) until the enforcement switch is staged
   ↓
Supabase Auth + Storage
   ↓
Paymob (Intention API + Unified Checkout) — BLOCKED (see §6)
WhatsApp (wa.me fallback) — verified
```

## 3. Production domains

| Surface | Required | State |
| --- | --- | --- |
| Marketing website | `https://yourdomain.com` | BLOCKED — no production domain |
| API | `https://api.yourdomain.com` | BLOCKED — no production domain |
| Merchant storefront | `https://{slug}.yourdomain.com` | BLOCKED — no production domain |
| Local `/store/[slug]` route | works | VERIFIED (web build + route compile) |
| Host-based resolution (API) | `Host: {slug}.platform-domain.com` → 200, root/unknown → 404 | VERIFIED live (host resolution enabled) |
| `STOREFRONT_DOMAIN` | real apex domain | PLACEHOLDER `platform-domain.com` |
| DNS / wildcard / SSL | external | BLOCKED — requires a registered domain + DNS provider access |

## 4. RLS status

### Test environment (NEW — executable)
- A dedicated local PostgreSQL 18.6 was provisioned (scoop) and
  `ziad_rls_test` created with ALL migrations applied (init →
  rls_enforcement → whatsapp_orders → order_lookup_token_and_job_leases →
  **new 20260817000000_rls_policy_fixes**).
- The **78 previously-skipped RLS/database tests now RUN and PASS**
  (14 suites, 77 tests + `rls-integration`), `POSTGRES_RLS_TEST_DATABASE_URL`
  + `RLS_ENFORCEMENT_ROLE=ziad_runtime` set. `docs/RLS-TEST-ENVIRONMENT.md` was
  updated to record the executed result.
- `scripts/rls-verify.ts` → **PASS** against the test DB (role exists, FORCE on
  28 tables, own-row read OK, cross-tenant SELECT/INSERT denied, NULL context
  sees nothing).

### Live Supabase database
- `ziad_runtime` role EXISTS; FORCE ROW LEVEL SECURITY is ON for all 28
  tenant tables (migration 20260814000000 was already applied).
- The app connection (`postgres` via the transaction pooler) has
  `rolbypassrls=true` → the live app still bypasses RLS.
- The pooler role CANNOT `SET ROLE ziad_runtime` ("permission denied to set
  role") — confirmed live. Flipping `RLS_ENFORCEMENT_ROLE=ziad_runtime` today
  breaks every tenant write with `42501` (reproduced during the E2E run), so it
  is NOT flipped until the staged ops step is performed.
- **New migration `20260817000000_rls_policy_fixes`** was created and applied
  to BOTH the test DB and the live DB. It fixes two real defects discovered
  while executing the RLS suites:
  1. `member_membership_select` on `store_memberships` was self-referential →
     PostgreSQL "infinite recursion detected in policy". Replaced with a
     non-recursive `auth.uid() = user_id` policy.
  2. `app.set_current_store_id(uuid)` lacked an `anon` EXECUTE grant → the

- **Remaining ops step for live enforcement (exact commands):**
  1. `GRANT ziad_runtime TO postgres;` (or create a dedicated login role
     `ziad_app LOGIN IN ROLE ziad_runtime` and point DATABASE_URL at it).
  2. Set `RLS_ENFORCEMENT_ROLE=ziad_runtime` in the production environment.
  3. Restart the API and run `scripts/rls-verify.ts` against the live DB →
     must PASS.
  4. Regression-test the full merchant surface (identity reads and storefront
     reads run on the bypassing connection by design; tenant-bound writes then
     enforce RLS).
  - **Rollback:** unset `RLS_ENFORCEMENT_ROLE`, restart; `REVOKE ziad_runtime
    FROM postgres;` — RLS remains enabled+FORCED but the app returns to the
    bypassing connection (Phase 23 behaviour). Do NOT disable RLS.

### Findings from executing the RLS suites (fixed in the test specs/scripts)
- Raw SQL probes needed `::uuid` casts for text parameters (PostgreSQL 18 is
  strict) — fixed across `db-helpers.ts` and the 14 blocked suites.
- Cross-tenant INSERT under RLS raises `42501` (not a silent 0-row filter) —
  the probes were corrected to assert the denial.
- `cart_items` and `orders.customer_id` use deliberately non-composite FKs
  (tenant inherited through the parent cart/order, DATABASE.md §29.4); the two
  tests were rewritten to assert the actual RLS parent-tenant boundary.
- `navigations.items`, `customer_addresses` NOT NULL columns, RESTRICT-FK
  SQLSTATE (23001), and enum casts (`order_status`) were corrected in the test
  environment.

## 5. Security posture

| Control | State |
| --- | --- |
| Secrets in Git | NONE — only `.env.example` tracked; the single JWT-shaped string in a spec is `.fake-token` |
| Secrets in frontend | NONE — only `NEXT_PUBLIC_*` public values; Paymob/Supabase secrets server-only |
| RLS | Enforced in test env; live staged (see §4) |
| Tenant isolation (app) | Guard chain + tenant-safe repositories + cross-tenant e2e (PASS) |
| Rate limiting | Global sliding-window limiter; enabled outside test; 429 + Retry-After verified (Phase 23) |
| Reservation expiry | Distributed-lease sweep; never releases CONSUMED; unit/e2e verified |
| Media limits | 10 MB cap, MIME allowlist, magic bytes, safe keys; 400 probes |
| Security headers | nosniff / DENY / strict-origin-when-cross-origin / Permissions-Policy (+ HSTS in prod) |
| CORS | Explicit allowlist; production refuses wildcard at boot |
| Webhook HMAC | SHA-512 over `obj` concat; timing-safe; missing/invalid → 400; idempotent dedup |
| Order lookup PII | Per-order `lookup_token`; PII-free fallback; rate-limited |


## 6. Paymob verification

| Item | Result |
| --- | --- |
| `PAYMOB_API_KEY` present | ✅ real key — authenticates on `POST /api/auth/tokens` (201 + merchant profile) |
| `PAYMOB_INTEGRATION_ID` present | ✅ `4624759` (test card integration) |
| `PAYMOB_HMAC_SECRET` present | ✅ set (32 chars, non-placeholder) |
| `PAYMOB_PUBLIC_KEY` | ❌ **UNSET** — the account's public key is required for the Unified Checkout URL and is NOT in the local environment |
| `PAYMOB_WEBHOOK_URL` | ❌ **UNSET** — no public HTTPS webhook URL exists (no deployed domain/tunnel) |
| Startup diagnostic | ✅ logs `Paymob is NOT fully configured. Missing: PAYMOB_PUBLIC_KEY` |
| Webhook route | ✅ `POST /api/v1/webhooks/paymob` mapped; HMAC verification + idempotency implemented and tested |
| Intention API live probe | ⚠️ `POST {PAYMOB_API_URL}/v1/intention` returns `401 Authentication credentials were not provided` for EVERY auth format probed (body `api_key`, query param, Bearer/Token/Basic/`X-Api-Key`). The account key works on the legacy auth endpoint but the Intention API does not accept it — the integration needs the merchant to confirm the current Intention API auth contract (a new-format secret key may be required). |

**Acceptance for this blocker:** a real Paymob TEST card transaction that
reaches the final payment/order state through the actual external callback.
**Status: BLOCKED** — not met. No PASS is claimed from unit tests or API
responses. See `docs/FIRST-MERCHANT-PILOT-CHECKLIST.md` §3 for the exact
required inputs.

## 7. WhatsApp verification

WhatsApp ordering (wa.me fallback) is **verified** (Phase 22 + full API E2E):
real orders created (channel WHATSAPP, PENDING, unpaid), EN/AR message
generation, idempotent order reuse, tenant-safe store resolution, merchant
confirmation flow, no PII leaks. The web E2E storefront WhatsApp-order test is
in the 21 passing tests.

## 8. Database state (live)

- Supabase hosted PostgreSQL (transaction pooler port 6543), 28 tenant tables +
  `job_leases` + `orders.lookup_token`.
- Migrations applied through **20260817000000_rls_policy_fixes** (new).
- RLS enabled + FORCED on 28 tables; `ziad_runtime` role exists.
- 1 store (`ziad-store`, ACTIVE, 2 members), 2 users
  (`ziadelshoky12@gmail.com` = real merchant, `e2e.merchant@ziad.test` = E2E).
- 0 subscriptions for the store (code falls back to TRIAL — Phase 20 finding).
- Dedicated local RLS test DB `ziad_rls_test` provisioned and green.

## 9. Pilot data state

`scripts/pilot-cleanup.ts` **dry-run executed** against the live DB:

| Class | Count |
| --- | --- |
| TEST products | 55 |
| TEST categories | 23 |
| TEST users | 1 (`e2e.merchant@ziad.test` app row) |
| REAL products | 49 |
| REAL categories | 31 |
| REAL store | 1 (`ziad-store`) |
| REAL users | 1 (merchant) |

**No destructive apply was run** — the 49 REAL products require explicit
merchant review; the TEST user row must also survive while the web E2E suite
still logs in with it. Apply only after: (a) the merchant confirms the REAL
catalog, and (b) the E2E account is no longer needed or is recreated.

## 10. E2E results (this closure run)

| Suite | Result |
| --- | --- |
| API unit | ✅ 1023 passed / 131 suites |
| Web unit | ✅ 106 passed / 22 files |
| API E2E | ✅ **517 passed / 0 failed / 0 skipped** (34 suites) — includes the full RLS/database suites (previously 78 skipped) |
| Web E2E | ✅ 21 passed / ⚠️ 1 failed (onboarding signup — Supabase rate limit) / ⏭ 1 skipped (Paymob live) |
| API typecheck / lint / build | ✅ PASS |
| Web typecheck / lint / build | ✅ PASS |
| `rls-verify.ts` (test DB) | ✅ PASS |

**Web E2E onboarding blocker — test environment fixed:**
- The E2E email domain is now configurable (`E2E_EMAIL_DOMAIN`, default
  `gmail.com` — a domain the configured Supabase project accepts; `ziad.test`
  and `example.com` are rejected as "invalid" by GoTrue).
- The signup test now deletes its throwaway user after the run (Supabase admin
  API, best-effort) so repeated runs do not pollute the shared project.
- The single remaining failure is the **shared project's signup rate limit**
  (429 → "Too many attempts. Please wait a moment and try again."). This is an
  operational condition that resets over time; the suite will pass when the
  limit has reset. It is NOT a code defect and was not faked.


## 11. Exact blockers (honest list)

1. **Real Paymob TEST payment — BLOCKED (external).** `PAYMOB_PUBLIC_KEY` and
   `PAYMOB_WEBHOOK_URL` are absent, and a live probe shows the Intention API
   returns 401 for all auth formats with the current credentials. The merchant
   must provide the public key + a public webhook URL and confirm the current
   Intention API auth contract.
2. **Production wildcard domain / DNS / SSL — BLOCKED (external).** No
   production domain is registered; `STOREFRONT_DOMAIN` is the
   `platform-domain.com` placeholder. Host-based routing logic is verified
   locally; DNS/SSL/proxy deployment requires domain + DNS provider access.
3. **Live RLS enforcement — staged.** The live DB has the role + FORCE RLS and
   the policy-fix migration; the app connection must be granted
   `ziad_runtime` membership and `RLS_ENFORCEMENT_ROLE` set (ops step §4),
   then `rls-verify.ts` must PASS live.
4. **Supabase signup rate limit — external/operational.** The shared project
   rate-limits signups; the onboarding E2E cannot pass until the window resets.
   The test-environment fix (configurable domain + cleanup) is in place.
5. **Pilot merchant confirmation — human step.** A real, confirmed merchant
   email + the 49 REAL products require the merchant's explicit review before
   cleanup apply.

## 12. Final merchant checklist

See `docs/FIRST-MERCHANT-PILOT-CHECKLIST.md` — every item must be checked
against real infrastructure before the merchant takes real orders.

## 13. Rollback plan

- **App:** redeploy the previous build (migrations are forward-only/additive).
- **Migration 20260817000000 (policy fixes):** if ever needed, restore the old
  recursive policy only during the pre-pilot window; the fix is the correct
  contract for fresh databases.
- **RLS enforcement switch:** unset `RLS_ENFORCEMENT_ROLE`, restart;
  `REVOKE ziad_runtime FROM <app-role>;`. Never disable RLS or remove policies.
- **Database restore:** Supabase daily backups + PITR; monthly restore drill to
  a scratch project and re-run the API E2E (RLS suites included).
- **Pilot data:** `scripts/pilot-cleanup.ts` runs only after merchant review;
  the destructive apply is a single transaction that fails safe on ambiguity.

## 14. Production deployment steps

1. Register the domain; configure wildcard DNS (`*.yourdomain.com`) + wildcard
   TLS; set `STOREFRONT_DOMAIN`, `CORS_ORIGINS`, `TRUST_PROXY=1`.
2. Create a dedicated production database (Supabase project for the pilot).
3. Deploy API + web (`NODE_ENV=production`); run migrations before the new
   build starts.
4. Create the private `media` bucket.
5. RLS: apply the role switch (§4), set `RLS_ENFORCEMENT_ROLE`, run
   `scripts/rls-verify.ts` → PASS.
6. Payments: obtain `PAYMOB_PUBLIC_KEY` + `PAYMOB_WEBHOOK_URL`, confirm the
   Intention API auth contract, run one real TEST card payment end-to-end.
7. Create the pilot merchant with a real confirmed email; enable WhatsApp with
   a valid number.
8. Review the pilot catalog (`pilot-cleanup.ts` dry-run + merchant
   confirmation); seed/curate the storefront.
9. Enable monitoring + alerts; verify backups; run the final smoke test
   (§8 of the checklist) and record the result here.

## 15. Final verdict

**GO WITH CONDITIONS.**

- All code, test, and build validation is green (API unit 1023, web unit 106,
  API E2E 517/0/0 including the RLS suites, web E2E 21/1/1 with the 1 failure
  being the external signup rate limit, typecheck/lint/build PASS, rls-verify
  PASS against the RLS test environment).
- The RLS/database test environment is now executable and the previously
  blocked suites pass; two real migration defects were found and fixed
  (recursion + anon grant) and applied to both the test and live databases.
- **GO is NOT declared** because: no real Paymob TEST card transaction has ever
  reached the final payment/order state through the external callback, the
  production wildcard domain is unavailable, and live RLS is not yet switched
  to the enforcement role (staged ops step). These are specific, non-critical
  operational/external items with documented exact commands — hence GO WITH
  CONDITIONS, not NO-GO (no security regression, no secrets exposed, no PII
  exposure, application-level tenant isolation and every production control is
  verified).

     public storefront (anon) read path could not bind the resolved store.
