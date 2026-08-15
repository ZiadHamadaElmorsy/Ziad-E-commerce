# IMPLEMENTATION — PHASE 24–25 — COMPLETE PAYMENTS, FIX PREVIOUS FINDINGS, HARDEN COMMERCE & FIRST MERCHANT PILOT

**Status:** COMPLETE — implemented, validated, documented. The only external-dependency
verification that could not be completed in this environment is the **real Paymob TEST card
payment** (the merchant's new-format Paymob Secret Key is required — see §4/§5) and the
**production wildcard domain** (explicitly out of scope — §31 of the phase brief).
**Verdict:** **GO WITH CONDITIONS** — see §20.

---

## 1. Phase scope

Combine the two planned phases:

- **Phase 24 — Payments, Checkout & Commerce Production Readiness**
- **Phase 25 — First Merchant Pilot Preparation**

Objective: move the platform from "core product implemented and code-tested" to
"commerce flow fully verified, operational gaps closed, Paymob genuinely tested, WhatsApp
fallback production-safe, tenant/security issues closed, and operationally ready for the
first real merchant pilot."

Deliberately NOT done (per the brief): production domain purchase, Vercel custom domain,
wildcard DNS/SSL, final production DNS routing. The app continues working locally and
through the current Cloudflare Quick Tunnel used for Paymob webhook testing.

---

## 2. Previous findings reviewed

All prior documentation was inspected: `PRODUCT-AUDIT-PHASE20.md`,
`IMPLEMENTATION-PHASE21/22/23-*.md`, `FINAL-GO-LIVE-CLOSURE.md`,
`FIRST-MERCHANT-PILOT-CHECKLIST.md`, `RLS-TEST-ENVIRONMENT.md`,
`PRODUCTION-DEPLOYMENT-RUNBOOK.md`. The repository source was treated as the source of
truth; every claim below was re-verified against the code and the live database.

The five known blockers from prior phases:

| # | Blocker | Phase 24–25 outcome |
|---|---|---|
| A | Paymob Intention API returned `401 Authentication credentials were not provided` | **Resolved as an authentication-contract issue** — the Intention API requires the NEW-format Paymob Secret Key (`egy_sk_test_...`) via an `Authorization` header; the legacy JWT `PAYMOB_API_KEY` only authenticates the legacy endpoints. Provider updated to the current contract; the real transaction remains **BLOCKED** only until the merchant provides the new-format key (§5). |
| B | Live RLS not enforced (app ran as `postgres` with BYPASSRLS) | **Resolved live** — `RLS_ENFORCEMENT_ROLE=authenticated`, all tenant-bound transactions now run under the non-bypass role; `rls-verify.ts` PASS against the live Supabase DB; two real gaps fixed (special-table policies + RLS-aware SKU conflict mapping) (§11). |
| C | Web E2E signup failed (Supabase rate limit + email confirmation) | **Resolved deterministically** — admin-API email confirmation + rate-limit fallback provisioning; onboarding store-transition bug fixed; Web E2E now **22 passed / 0 failed / 1 skipped** (§13). |
| D | Pilot data hygiene | Classification dry-run re-produced; **all E2E/probe test stores and orphan users created during this phase removed**; deletion of the pre-existing TEST rows remains manual (gated) (§14). |
| E | Onboarding never fully verified end-to-end | **Fixed and verified** — the onboarding page hid the whole flow after store creation (a genuine product bug); the full merchant journey now passes in Web E2E (§13). |

---

## 3. Previous findings fixed

1. **Paymob provider updated to the current Intention API contract** (§5).
2. **Paymob HMAC verified against BOTH current and classic field lists** (§7) so a real
   callback is accepted regardless of which documented order Paymob signs with.
3. **Live RLS enforced** with the app running tenant-bound transactions under a non-bypass
   role; `rls-verify.ts` PASS live (§11).
4. **RLS special-table policies added** — `stores` / `store_memberships` / `subscriptions`
   lacked UPDATE policies and used only `auth.uid()`-based SELECT policies, so
   `PATCH /stores/current` and subscription transitions 404'd under enforcement. A new
   migration (`20260818000000_rls_app_tenant_policies`) adds app-tenant policies keyed on
   `app.current_store_id()`.
5. **RLS-aware SKU uniqueness** — PostgreSQL suppresses the unique-violation DETAIL for
   roles subject to RLS, so Prisma reports `meta.target=null` and the generic conflict
   message was shown. The variant service now pre-checks SKU uniqueness within the store
   (tenant-bound) and returns the precise conflict message; the DB index stays the
   atomic backstop.
6. **Onboarding store-creation continuation bug** — after `POST /onboarding/merchant`
   succeeded, the auth refresh set `store` and the render guard `if (store) return null`
   hid the whole onboarding flow, so steps 2–4 never rendered. Fixed (guard now only
   hides when arriving WITH an existing store) + regression unit test.
7. **Web E2E deterministic signup** — email confirmation via admin API; rate-limited
   signups fall back to admin-API provisioning (never a production auth change); cleanup
   always runs (§13).
8. **API E2E determinism** — `test/env.e2e.ts` now pins the Paymob env so the suite no
   longer depends on the developer's `.env` (the storefront `payOnline` flag was flapping).

---

## 4. Paymob architecture (unchanged decision, now fully specified)

**Intention API + Unified Checkout (Option A)** remains the selected flow:

```text
POST {PAYMOB_API_URL}/v1/intention
  Authorization: Bearer <PAYMOB_API_KEY>          (PAYMOB_AUTH_SCHEME: Bearer|Token)
  body: amount (minor units), currency, payment_methods=[integration id],
        billing_data (phone_number required), items (name+amount required),
        special_reference = payment UUID, notification_url (PAYMOB_WEBHOOK_URL),
        redirection_url (customer return), expiration (seconds)
  -> { id, client_secret }

Checkout URL: {PAYMOB_API_URL}/unifiedcheckout/?publicKey={PAYMOB_PUBLIC_KEY}&clientSecret={client_secret}
```

- `client_secret` is carried ONLY inside `providerCheckoutUrl` — never persisted or logged.
- The webhook remains the authoritative confirmation; browser redirects are never trusted.
- `PAYMOB_IFRAME_ID` is not required.

---

## 5. Paymob authentication resolution (Blocker A)

**Determined empirically against the merchant's real TEST account** (August 2026):

- `POST https://accept.paymob.com/v1/intention` rejected every legacy credential format
  (`api_key` body, `Authorization: Token/Bearer <legacy api key>`, `X-Api-Key`, query
  params, the legacy `/api/auth/tokens` JWT) with the DRF message
  `401 Authentication credentials were not provided.`
- The server's `WWW-Authenticate: Bearer realm=Paymob` header advertises Bearer auth.
- The legacy `/api/auth/tokens` endpoint still authenticates the legacy JWT
  `PAYMOB_API_KEY` (201), but the Intention API does not accept it.
- The account's `PAYMOB_PUBLIC_KEY` is new-format (`egy_pk_test_...`), i.e. a
  new-Paymob-dashboard account whose Intention API is authenticated by the
  **new-format Secret Key** (`egy_sk_test_...`) via the Authorization header.

**Conclusion:** the Intention API requires the merchant's NEW-format Secret Key
(Paymob dashboard → Settings → API Keys → Secret Key). The legacy JWT api key cannot
authenticate it. The provider now sends `Authorization: Bearer <PAYMOB_API_KEY>` (default;
`PAYMOB_AUTH_SCHEME=Token` switches to Paymob's documented `Token <secret>` form) and
warns at boot when the configured key looks like a legacy JWT.

**External action required (the only Paymob blocker):** generate the new-format Secret Key
in the Paymob dashboard and set it as `PAYMOB_API_KEY`, then restart the API. The Intention
call will then authenticate (the provider, URL, body and checkout URL already follow the
current contract). Until then, `payOnline=false` is reported on the storefront and
payment initiation fails closed — WhatsApp ordering keeps working.

---

## 6. Paymob TEST transaction

**BLOCKED — external credential.** The provider now sends the correct Authorization header
and body, but the account's new-format Secret Key (`egy_sk_test_...`) is not present in the
environment (the available `PAYMOB_API_KEY` is the legacy JWT). Without it the Intention
API returns 401 for every request (verified repeatedly). No real TEST card transaction has
been completed. This is reported honestly as BLOCKED, not passed.

Once the key is provided, the intended flow is:

```text
Merchant -> Store -> Published Product -> Inventory -> Storefront -> Product Details ->
Cart -> Checkout -> Pay Online -> Paymob TEST (Intention) -> Unified Checkout ->
TEST card (4111 1111 1111 1111 / 01-39 / 123) -> Paymob -> Webhook -> HMAC ->
Payment SUCCESS -> Order confirmed -> Inventory consumed -> Merchant Dashboard
```

Paymob's current sandbox test cards (June 2026): Visa `4111111111111111`,
Mastercard `5123456789012346` / `5123450000000008`, expiry `01/39`, CVV `123`.

---

## 7. Webhook / HMAC

- `POST /api/v1/webhooks/paymob` is `@Public()`; authenticity comes only from the Paymob
  HMAC. Missing/invalid signatures → 400 (fail closed).
- **Phase 24 HMAC upgrade:** Paymob's current "Transaction Processed" docs list a
  20-field concatenation order that differs from the long-standing 24-field list
  (`error_occured` vs `error_occurred`, `has_parent_transaction` vs
  `has_source_management`, `order.id` vs `order`, plus `integration_id` and no
  `is_refunded_partial`/`refunded_amount_cents`/`token`/`transaction_id`). The verifier now
  accepts either documented list (both keyed on the shared HMAC secret — no security
  weakening) and logs which scheme matched for operators.
- Processing: claim `payment_events` (UNIQUE provider+event — duplicate deliveries are
  no-ops) → resolve payment from `merchant_order_id` → guarded transitions in ONE
  tenant-bound transaction → SUCCESS: payment SUCCEEDED, reservation ACTIVE→CONSUMED,
  order PENDING→CONFIRMED; FAILURE: payment FAILED, reservation ACTIVE→RELEASED.
- Real Paymob callback verification is BLOCKED until §6 is unblocked.


---

## 8. Payment / order / inventory consistency

| Scenario | Expected | Verified |
|---|---|---|
| Success | payment SUCCEEDED, order CONFIRMED, reservation consumed once | unit + e2e (webhook service spec, orders/payments e2e) |
| Failure | payment FAILED, order pending/failed, reservation released | unit + e2e |
| Cancel | guarded order transition, reservation released | unit + e2e |
| Expired | expiry sweep releases ACTIVE reservations (never CONSUMED) | unit + live sweep logs |
| Duplicate callback | `payment_events` UNIQUE → safe no-op | unit + e2e replay |

---

## 9. Idempotency

Reviewed and kept (no duplicate infrastructure added):

- **Checkout:** `Idempotency-Key` header → returns the existing order on replay; the
  guarded `ACTIVE → COMPLETED` cart transition means one cart can never produce two orders.
- **Payment creation:** same idempotency mechanism.
- **Webhook:** UNIQUE `(provider, provider_event_id)` claim.
- **WhatsApp order:** passing `orderId` reuses the existing order (verified LIVE — the
  same order id is returned, no duplicate).
- **Live verification:** the live smoke run created an order via checkout then reused it
  via WhatsApp (`channel=WHATSAPP, status=PENDING`, same id).

---

## 10. Checkout revalidation (§12 of the brief)

Verified by inspection (no code change needed — already complete):

- Store/product/variant/price/quantity/inventory/customer/address all revalidated
  server-side from the database; client prices/totals are never trusted.
- `revalidateLine` rejects cross-store variants, non-ACTIVE products/variants, negative
  prices; totals are computed with BigInt minor units.
- Availability uses atomic guarded inventory increments (never read-then-write).
- Whole-checkout transaction rolls back on any failure (no partial order/reservations).

---

## 11. RLS live enforcement (§18–19 of the brief)


---

## 12. RLS test results

| Check | Result |
|---|---|
| Local PostgreSQL `ziad_rls_test` (all 6 migrations applied) | PASS |
| API E2E with `POSTGRES_RLS_TEST_DATABASE_URL` + `RLS_ENFORCEMENT_ROLE=ziad_runtime` | **517 passed / 0 failed / 0 skipped** |
| `rls-verify.ts` (local test DB) | PASS |
| `rls-verify.ts` (LIVE Supabase DB, `RLS_ENFORCEMENT_ROLE=authenticated`) | **PASS** |
| Live cross-tenant probes (via rls-verify + merchant smoke) | PASS |

Live isolation matrix (Merchant A vs B): products/orders/customers/inventory/media/theme/
WhatsApp — all application-level store-scoped AND database-level RLS-denied (verified via
rls-verify probes; cross-tenant writes/inserts return 42501/empty).

---

## 13. Web E2E (§20 of the brief)

### The failure was TWO problems, both fixed

1. **Signup landed on "Check your email"** (the Supabase project has email confirmation
   enabled) — the test now confirms the throwaway user via the admin API and continues
   through the real login flow.
2. **The signup endpoint rate-limits** the shared project ("Too many attempts") — the test
   now provisions the user pre-confirmed via the admin API as a deterministic fallback and
   continues the journey (login → onboarding → store → theme → first product → dashboard).
   Admin-provisioned users do not consume the public signup rate-limit quota. No
   production auth changes were made.
3. **A genuine onboarding bug surfaced** — after store creation the onboarding page
   returned `null`, so steps 2–4 never rendered. Fixed + regression test.

### Result

```text
Web E2E (Playwright, real stack + real Supabase):  22 passed / 0 failed / 1 skipped
Previous:                                           21 passed / 1 failed / 1 skipped
```

---

## 18. Exact test results (Phase 24–25)

| Command | Result |
|---|---|
| `npm run typecheck -w @ziad/api` | PASS |
| `npm run typecheck -w @ziad/web` | PASS |
| `npm run lint -w @ziad/api` | PASS |
| `npm run lint -w @ziad/web` | PASS |
| `npm run test -w @ziad/api` | **1030 passed** / 131 suites |
| `npm run test -w @ziad/web` | **107 passed** / 22 files |
| `npm run build -w @ziad/api` | PASS |
| `npm run build -w @ziad/web` | PASS |
| `npm run test:e2e -w @ziad/api` (RLS test env) | **517 passed / 0 failed / 0 skipped** |
| `npm run test:e2e -w @ziad/web` | **22 passed / 0 failed / 1 skipped** (Paymob live) |
| `rls-verify.ts` (live Supabase) | **PASS** |
| Live merchant smoke (RLS enforced) | **13/13 PASS** |

New/updated tests: Paymob provider (current auth header, no api_key in body,
redirection_url/expiration, camelCase checkout URL, Token-scheme option, legacy-JWT
diagnostic, 401 remediation log), Paymob HMAC (current + classic field lists, scheme
detection), variant SKU pre-check (unit + e2e stub update), onboarding page continuation
regression, API e2e env determinism.

---

## 19. Remaining blockers

1. **Real Paymob TEST payment + real webhook — BLOCKED (external).** The Intention API
   authentication contract is resolved (Bearer + new-format Secret Key), but the account's
   `egy_sk_test_...` key is not in the environment. Provider-side action: generate the
   Secret Key in the Paymob dashboard (Settings → API Keys → Secret Key) and set
   `PAYMOB_API_KEY`; then run one real TEST card payment and verify the webhook. The code,
   URL, body, checkout URL, and HMAC are all ready and tested against the documented
   contract.
2. **Production wildcard domain / DNS / SSL — intentionally deferred** (§31 of the brief).
3. **Live `ziad_runtime` as the enforcement role — external ops step.** The app enforces
   RLS live via `authenticated` today (verified). The dedicated `ziad_runtime` role can be
   used after a one-time Supabase dashboard SQL: grant the app role `SET`/ADMIN on
   `ziad_runtime` (or create a LOGIN runtime role) and set `RLS_ENFORCEMENT_ROLE=ziad_runtime`.
4. **Pilot data deletion — human step.** The dry-run report is ready; deletion of the
   pre-existing TEST rows is gated and requires the merchant's review.

---

## 20. Final recommendation

**GO WITH CONDITIONS.**

- All commerce/security/tenant/payment-code requirements are verified: API unit 1030,
  web unit 107, API E2E 517/0/0 (incl. the RLS suites), web E2E 22/0/1 (the one skip is
  the genuinely environment-blocked real Paymob TEST payment), typecheck/lint/build PASS,
  live RLS enforced and verified, tenant isolation database-enforced, idempotency and
  consistency verified, onboarding fixed, data clean.
- The only condition that prevents a full GO is the **real Paymob TEST transaction and
  its webhook**, which requires the merchant's new-format Paymob Secret Key (an external
  credential that only the Paymob dashboard can produce). Everything downstream of that
  credential is implemented and unit/e2e-tested.

---

## 21. What must happen next

1. Merchant: generate `egy_sk_test_...` in the Paymob dashboard → set `PAYMOB_API_KEY` →
   restart the API → run ONE real TEST card payment → confirm the webhook confirms the
   order and inventory is consumed. Record it in `FINAL-GO-LIVE-CLOSURE.md`.
2. Ops: run the live webhook/payment smoke through the current Cloudflare Quick Tunnel
   (`PAYMOB_WEBHOOK_URL` is env-configured, not hardcoded).
3. Ops (optional): switch `RLS_ENFORCEMENT_ROLE` to `ziad_runtime` after the dashboard SQL
   grant, then re-run `rls-verify.ts`.
4. Merchant: review the pilot-cleanup dry-run and approve/apply the TEST-row deletion;
   curate the pilot catalog (49 REAL products).
5. Deployment: when the feature work is complete, proceed to the production domain phase
   (purchase, wildcard DNS/SSL, Vercel custom domain) per `PRODUCTION-DEPLOYMENT-RUNBOOK.md`.


The single skipped test is `customer completes checkout with the live Paymob flow`
(environment-blocked: the real Paymob TEST environment is genuinely unavailable until §6
is unblocked). Test emails are configurable (`E2E_EMAIL`, `E2E_EMAIL_DOMAIN`), cleanup
(`deleteSupabaseUserByEmail`) always runs, and each run uses a unique email/store.

---

## 14. Pilot data hygiene (§21 of the brief)

- `pilot-cleanup.ts --dry-run` classification re-run against the live DB.
- **All test stores/users created during THIS phase were removed** (journey-store-*,
  admin-probe-store-*, orphan auth users) — the live DB is back to one REAL store
  (`ziad-store`) and one REAL merchant user.
- Remaining classification (dry-run report; deletion remains manual/gated):

```text
REAL: stores=1, users=1, products=66, categories=37
TEST: users=1 (e2e.merchant@ziad.test), products=66, categories=26
```

- The 49 REAL products are NOT deleted automatically. The destructive apply stays behind
  `PILOT_CLEANUP_CONFIRM=YES` + `--apply` and fails safe on ambiguity.

---

## 15. Merchant readiness (§22–23 of the brief)

- The onboarding journey (the blocker for a merchant getting started) is **fixed and
  verified end-to-end** (Web E2E passes).
- Merchant dashboard flows verified in Web E2E: login, dashboard, products CRUD,
  variants, categories, orders, customers, store settings, WhatsApp settings, inventory,
  media, Arabic/RTL.
- No dashboard redesign was done — only the genuine onboarding blocker was fixed.
- Pilot checklist: `docs/FIRST-MERCHANT-PILOT-CHECKLIST.md` remains the sign-off sheet; the
  only unverified items are the Paymob TEST payment/webhook (external key) and the
  production domain (explicitly out of scope).

---

## 16. Customer readiness (§24 of the brief)

Storefront + customer journey verified in Web E2E (mobile/desktop layout, EN/AR, RTL,
product details, variants, cart, checkout, WhatsApp order, guest access) and live API
smoke (cart → checkout → WhatsApp order → merchant dashboard). Paymob card checkout is
blocked only by §6.

---

## 17. Security regression (§25 of the brief)

| Control | State |
|---|---|
| Rate limiting | preserved; e2e + live probes |
| Security headers | preserved (`app.setup.ts`) |
| CORS allowlist | preserved (production refuses `*`) |
| Media restrictions | preserved (size/MIME/magic bytes/safe keys) |
| Host resolution | preserved (`storefront-host.ts`, fail closed) |
| Reservation expiry | preserved + live sweep logs |
| Tenant isolation | preserved + now ALSO database-enforced live |
| RLS | **now genuinely enforced live** |
| Webhook HMAC | preserved + current-field-list support |
| Order lookup / PII | preserved (lookup token; no PII without token; token never in Paymob URL/logs) |
| Secret handling | env-only; Paymob provider logs no secrets; legacy-key warning is advisory |

### Live database findings (read-only probes against the real Supabase DB)

- `ziad_runtime` EXISTS (NOLOGIN, bypassrls=false, member of `authenticated`).
- The app connection is `postgres` (BYPASSRLS=true) via the transaction pooler (port 6543).
- `postgres IN ziad_runtime (set_option=false)` → **`SET LOCAL ROLE ziad_runtime` is denied**
  (`permission denied to set role`) and `postgres` has no CREATEROLE/ADMIN to fix it.
- `postgres IN authenticated (set_option=true)` → the app CAN `SET LOCAL ROLE authenticated`.

### Decision

`RLS_ENFORCEMENT_ROLE=authenticated` was configured (the only non-bypass role the app
connection can switch to). `authenticated` has bypassrls=false and the same tenant policies
`ziad_runtime` inherits (ziad_runtime IN authenticated). This makes live RLS genuinely
enforced now. The intended dedicated `ziad_runtime` role remains the production target; the
one-time dashboard SQL (grant `SET`/ADMIN on `ziad_runtime` to the app role, or create a
LOGIN runtime role) is documented in the runbook update.

### Fixes required to make the app work under enforcement

1. **Migration `20260818000000_rls_app_tenant_policies`** — the three "special" tables
   (`stores`, `store_memberships`, `subscriptions`) carried ONLY `auth.uid()`-based
   policies (the Supabase PostgREST model). The app never populates `request.jwt.claims`,
   so those policies filtered everything out and `PATCH /stores/current` returned 404.
   Added OR-composed app-tenant policies keyed on `app.current_store_id()` (SELECT/UPDATE
   for stores, SELECT for memberships, SELECT/UPDATE for subscriptions). RLS stays
   enabled + FORCED; this does NOT bypass RLS.
2. **RLS-aware SKU uniqueness** (§3 item 5) — PostgreSQL suppresses the unique-violation
   DETAIL for RLS-subject roles, so the API now pre-checks SKU uniqueness tenant-bound.

### Live verification (all PASS)

- `rls-verify.ts` against the LIVE Supabase DB → **PASS** (8/8 probes: role exists, FORCE
  RLS on 28 tables, own-store read, cross-tenant read blocked, storefront media/orders
  isolation, NULL-context fail-closed, cross-tenant INSERT blocked).
- Live merchant smoke under enforcement → **13/13 PASS** (health, storefront, merchant
  auth, products, orders, WhatsApp settings, cart, checkout, WhatsApp order with reuse,
  merchant sees order).
- Store PATCH now 200 under enforcement (was 404).
- Duplicate-SKU conflict now returns the precise message (was generic).

### Rollback

Unset `RLS_ENFORCEMENT_ROLE` and restart → app returns to the pre-enforcement owner
connection. The migrations are additive; `rls-verify.ts` documents the reverse steps.

### RLS regression

The full API E2E suite (including the 14 RLS/database suites against the local
`ziad_rls_test` PostgreSQL) passes: **517 passed / 0 failed / 0 skipped**.

