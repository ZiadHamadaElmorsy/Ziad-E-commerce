# PHASE 14 — SaaS SUBSCRIPTION FINAL REPORT

**Phase:** SaaS Subscription — roadmap **Phase 14** (docs/DEVELOPMENT-ROADMAP.md §17 "Phase 14 — SaaS Subscription").
**Status:** PASS (all offline-validatable scope complete; DB/RLS/PostgreSQL/Supabase validations BLOCKED — see §20–§21).

---

## 1. Verdict

**PASS** — the documented SaaS Subscription functionality is implemented end to end.

- The exact documented endpoint is implemented:
  - `GET /api/v1/subscription` — get the current subscription (docs/API-SPEC.md §30), exposing enough information for the frontend to determine TRIAL / ACTIVE / EXPIRED while the backend remains authoritative for access control.
- The FINALIZED subscription lifecycle is implemented as an application-enforced state machine (docs/DOMAIN-MODEL.md §16.1, docs/DATABASE.md §20.2): TRIAL → ACTIVE, TRIAL → EXPIRED, ACTIVE → EXPIRED, EXPIRED → ACTIVE (reactivation). All transitions are guarded conditional UPDATEs (docs/DATABASE.md §26.2); no PAST_DUE / CANCELLED / SUSPENDED.
- The free trial is created **atomically with each Store** (US-SUB-001): start/end dates tracked and the duration is a configurable business parameter `SUBSCRIPTION_TRIAL_DAYS` (BR-SUB-001 — not hard-coded).
- The expiry access overlay is enforced at the correct architectural boundaries:
  - **Merchant dashboard read-only** (BR-SUB-003, US-SUB-002): a new global `SubscriptionAccessGuard` (after AuthGuard → TenantContextGuard → RolesGuard) blocks every merchant **write** (POST/PUT/PATCH/DELETE) with `403 FORBIDDEN` when the subscription is EXPIRED; reads remain available. Commerce data is preserved; nothing is deleted or modified.
  - **Storefront disabled** (DOMAIN-MODEL §6.3): the public storefront resolver fails closed with `404 NOT_FOUND` (no existence leak) when the effective subscription status is EXPIRED — regardless of Store status — using a read-only evaluation (the public path performs no writes).
  - **Checkout boundary** (DATABASE §28.1 "validate store status + subscription access overlay"): checkout is a merchant write endpoint, so the same guard enforces the overlay at checkout.
- Lazy expiry evaluation: a TRIAL row whose `trial_ends_at` has elapsed is transitioned TRIAL → EXPIRED idempotently on access (merchant path), consistent with the MVP's lazy-evaluation pattern for inventory reservations (DATABASE §14.2). No undocumented periodic sweep job was invented (none is documented for subscriptions).
- **No schema or migration change was made.** The FINAL Prisma schema and the initial migration already contain the `subscriptions` table, the `subscription_status` enum (TRIAL/ACTIVE/EXPIRED), the UNIQUE `(store_id)` 1:1 constraint, the `status` index ("expiry sweeps / access-overlay checks", DATABASE §10.2), the `store_id` FK RESTRICT and the `member_subscription_select` RLS policy set. Phase 14 only adds the application module + access overlay on top of that contract.
- TypeScript, ESLint, Prettier (all new/modified files), `nest build`, `prisma validate`, `prisma generate`, **853 unit tests** and **277 E2E tests** pass (0 failures). **262 E2E tests are skipped** — every one is a blocked database test (`describe.skip` + `it.todo`).

---

## 2. Exact source documents inspected

| Document | Role |
|---|---|
| `docs/DOMAIN-MODEL.md` (v2.0, FINAL) | §3 domain architecture (Subscription controls Store access — access overlay); §6.2/§6.3 Store status vs Subscription overlay, storefront availability; §16 Subscription Domain (16.1 Subscription — purpose, ownership Store 1:1, lifecycle TRIAL/ACTIVE/EXPIRED, exact transitions, rules: no PAST_DUE/CANCELLED/SUSPENDED, dashboard read-only, storefront disabled, data preserved, reactivation supported, trial duration configurable); MVP status "Core (trial + expiry enforcement)"; item 11 in §32 final decisions |
| `docs/DATABASE.md` (v2.0, FINAL) | §5.2 subscriptions directly Store-owned; §7.4 subscriptions table (columns, UNIQUE store_id 1:1, status DEFAULT 'TRIAL', trial_started_at / trial_ends_at / activated_at / expires_at semantics, application-enforced transitions); §9 FK inventory (store_id FK RESTRICT); §10.2 indexes (status — expiry sweeps / access-overlay checks); §12 statuses/enums; §20 Subscription Data Model (20.1–20.4: expiry overlay, no billing/payment automation, invoices future scope, enforcement by backend/authorization layer); §25.1 subscriptions NOT physically deletable (retained as access history), §25.2 #5 no automatic deletion; §26.2 guarded conditional UPDATEs; §28.1 checkout "validate store status + subscription access overlay"; §29.5 special tables (subscriptions: members may read their store's subscription); §29.7 RLS testing |
| `docs/API-SPEC.md` (1.0, Draft) | §30 Subscription API — the only documented endpoint `GET /api/v1/subscription` (Get Current Subscription), expose TRIAL/ACTIVE/EXPIRED, backend authoritative for access control, frontend never trusted; §7/§8 response & error envelopes; §9 HTTP codes; §33 security rules |
| `docs/MVP-SCOPE.md` (1.0, Draft) | §4 module list (16. Subscription / Trial); §30 Subscription / Trial (Trial, Active, Expired; Store-scoped; "The exact pricing and payment model for SaaS billing may be finalized separately"); §31 Expired Subscription (dashboard read-only, storefront disabled, data remains stored, no automatic deletion); §32 Multi-Tenancy; §50/§51 AI agent scope rule |
| `docs/BRD.md` | §21 SaaS Subscription — BR-SUB-001 Trial (initial free trial; exact duration configurable, not hard-coded), BR-SUB-002 Active Subscription (normal operation), BR-SUB-003 Expired Subscription (dashboard read-only, storefront disabled, data retained); §25 merchant acceptance lines 753–754 |
| `docs/PRD.md` | §32 Subscription — Free Trial → Subscription Required; during active trial store operational + normal access; after expiration admin read-only, storefront disabled, data retained; after subscription store operational again |
| `docs/USER-STORIES.md` | §18 EPIC: Subscription — US-SUB-001 Start Trial (trial associated with Store; start date; expiration date; status tracked), US-SUB-002 Enforce Expired Subscription (dashboard read-only, storefront disabled, commerce data retained) |
| `docs/DEVELOPMENT-ROADMAP.md` (Approved) | §17 Phase 14 — SaaS Subscription (features list: free trial, subscription plans, monthly/annual subscription, subscription status, trial/subscription expiration, read-only mode, storefront closure, expiration behavior — data NOT deleted) |
| `docs/IMPLEMENTATION-PHASE13-MEDIA.md` | Prior phase report — established conventions (report structure, blocked-DB `describe.skip`/`it.todo`, e2e stub patterns), the exact-next-phase statement (Phase 14 — SaaS Subscription), and confirmation that the FINAL schema/migration already ships the tables + RLS policies for each phase |


---

## 3. Exact SaaS Subscription scope implemented

Only the functionality explicitly defined by the FINAL documents (with every ambiguity reported as an OPEN DECISION — §22):

1. **Subscription entity / Store 1:1** — reused exactly (already in the FINAL schema/migration). `subscriptions` is the commercial subscription/access state of a Store, directly Store-owned.
2. **Subscription plans** — NOT implemented: the FINAL schema defines **exactly 28 tables** (DATABASE §30) and contains no `subscription_plans` table/entity; the roadmap's "subscription plans / monthly / annual" wording is not backed by any FINAL entity, column, or status, and MVP-SCOPE §30 defers the pricing/payment model. Reported as OPEN DECISION #1.
3. **Free trial** — implemented: every new Store gets a TRIAL subscription row atomically (US-SUB-001) with `trial_started_at`/`trial_ends_at`; duration configured via `SUBSCRIPTION_TRIAL_DAYS` (BR-SUB-001).
4. **Subscription status** — exactly TRIAL / ACTIVE / EXPIRED; no PAST_DUE / CANCELLED / SUSPENDED.
5. **Start / expiry dates** — `trial_started_at`, `trial_ends_at`, `activated_at` (set on →ACTIVE), `expires_at` (set on →EXPIRED) per DATABASE §7.4.
6. **Lifecycle / state transitions** — TRIAL→ACTIVE, TRIAL→EXPIRED (lazy by date), ACTIVE→EXPIRED, EXPIRED→ACTIVE (reactivation), all guarded; invalid transitions rejected with STATE_TRANSITION.
7. **Access control / feature access overlay** — dashboard read-only (writes blocked 403) and storefront disabled (404) when EXPIRED; data preserved; no automatic deletion; enforcement in the backend/authorization layer.
8. **Subscription API** — exactly `GET /api/v1/subscription`.
9. **Tenant boundaries** — every subscription read/write derives storeId from the trusted tenant context; every transition write runs inside `TransactionService.runWithTenant` (RLS-bound).

## 4. Endpoints implemented

| Endpoint | Method | Docs | Behavior |
|---|---|---|---|
| `/api/v1/subscription` | GET | API-SPEC §30 | Returns `{ data: SubscriptionView }` (id, status TRIAL/ACTIVE/EXPIRED, trialStartedAt, trialEndsAt, activatedAt, expiresAt, createdAt, updatedAt) for the trusted tenant store; applies lazy expiry evaluation; 401 unauthenticated; 400 TENANT_CONTEXT_REQUIRED (multi-store, no selection); 403 FORBIDDEN cross-store; 404 when no subscription row exists. |

No other subscription endpoint exists in the FINAL documents, so **none was added** (no activation/reactivation/plan-management endpoints — those triggers are not documented; see OPEN DECISIONS #2/#3).

## 5. Entities/models reused or created

- **Reused (no change):** Prisma model `Subscription` (already in `apps/api/prisma/schema.prisma`), `SubscriptionStatus` enum, `subscriptions` table + indexes + RLS policy `member_subscription_select` in migration `20260812000000_init`.
- **Created (application-layer only, no new DB objects):** `SubscriptionView` type + mapper; domain status/lifecycle functions; `SubscriptionRepository`; `SubscriptionService`; `SubscriptionAccessGuard`; `SubscriptionController`.
- **No tables, columns, indexes, enums, or constraints were added.**

## 6. Files created

- `apps/api/src/subscription/subscription.module.ts` — module; registers the global `SubscriptionAccessGuard` (APP_GUARD) and exports `SubscriptionService` + `SubscriptionRepository`.
- `apps/api/src/subscription/controllers/subscription.controller.ts` (+ spec) — `GET /api/v1/subscription`.
- `apps/api/src/subscription/domain/subscription-status.ts` (+ spec) — pure state machine (allowed transitions, effective status incl. elapsed-trial boundary, expiry predicate).
- `apps/api/src/subscription/repositories/subscription.repository.ts` (+ spec) — store-scoped read, trial create, guarded transition UPDATE.
- `apps/api/src/subscription/services/subscription.service.ts` (+ spec) — startTrial, getCurrent/getCurrentForStore, assertMerchantWriteAllowed, resolveStorefrontStatus, activate (incl. reactivation), markExpired, idempotent lazy expiry.
- `apps/api/src/subscription/services/subscription-access.guard.ts` (+ spec) — global merchant write guard (read-only dashboard overlay).
- `apps/api/src/subscription/subscription.types.ts` (+ spec) — view mapping.
- `apps/api/test/subscription.e2e-spec.ts` — dedicated Phase 14 e2e suite (13 tests) over HTTP through the real guard chain + stateful stubbed PrismaService.
- `apps/api/test/subscription-database-tests.blocked.e2e-spec.ts` — BLOCKED DB/RLS/concurrency suite (`describe.skip` + `it.todo`, 13 items).
- `docs/IMPLEMENTATION-PHASE14-SAAS-SUBSCRIPTION.md` — this report.


---

## 7. Files modified (all additive/minimal)

- `apps/api/src/app.module.ts` (+2 lines) — register `SubscriptionModule` after `AuthorizationModule` so the guard chain is AuthGuard → TenantContextGuard → RolesGuard → SubscriptionAccessGuard.
- `apps/api/src/config/configuration.ts` (+3 lines) — `subscriptionTrialDays` config key with default 14.
- `.env.example` / `apps/api/.env.example` (+4 lines each) — documented optional `SUBSCRIPTION_TRIAL_DAYS=14`.
- `apps/api/src/identity/identity.module.ts` (+3 lines) — import `SubscriptionModule`.
- `apps/api/src/identity/services/store.service.ts` (+4 lines) — the store-creation transaction now also creates the TRIAL subscription (`SubscriptionService.startTrial(tx, storeId)`) — US-SUB-001. Its spec was updated accordingly.
- `apps/api/src/storefront/storefront.module.ts` (+3 lines) — import `SubscriptionModule`.
- `apps/api/src/storefront/domain/storefront-availability.ts` (+8 lines) — the Phase 14 subscription overlay (EXPIRED → storefront disabled) documented in Phase 11 as a Phase-14 dependency is now enforced; spec updated.
- `apps/api/src/storefront/services/storefront-store-resolver.ts` (+8 lines) — resolves the effective subscription status (read-only) via `SubscriptionService.resolveStorefrontStatus` and asserts availability; spec updated.
- Existing merchant-write e2e specs (identity, catalog, inventory, customer, cart, checkout, orders, payments, shipping-fulfillment, cms, media) — each Prisma stub now provides `subscription.findUnique` returning a TRIAL subscription for store-1 (the guard runs on merchant writes). The identity spec additionally provides `txClient.subscription.create` for the store-creation transaction.
- `apps/api/test/storefront.e2e-spec.ts` — subscription stub + one new overlay test (ACTIVE store with EXPIRED subscription → 404).

## 8. Files intentionally untouched

- `apps/api/prisma/schema.prisma` and all migrations — **no schema/migration change** (FINAL contract already ships subscriptions; verified with `prisma validate` + `prisma generate`).
- All FINAL documents (`DOMAIN-MODEL.md`, `DATABASE.md`, `API-SPEC.md`, `MVP-SCOPE.md`, `BRD.md`, `PRD.md`, `USER-STORIES.md`, `DEVELOPMENT-ROADMAP.md`, `ARCHITECTURE.md`, `AI-AGENT-RULES.md`).
- Orders, Payments, Checkout, Cart, Customer, Catalog, Inventory, CMS, Media modules — **unchanged** (no behavior was altered; their e2e test stubs only gained the subscription read the guard needs).
- Health, auth, authorization, tenant, infrastructure, common layers — unchanged.

## 9. Architecture

Follows the established chain exactly:

```
Request
→ RequestContextMiddleware
→ AuthGuard
→ TenantContextGuard
→ RolesGuard
→ SubscriptionAccessGuard (NEW — writes only)
→ Controller (SubscriptionController — GET /api/v1/subscription)
→ Service (SubscriptionService)
→ Repository (SubscriptionRepository)
→ Prisma
```

- The tenant store id is **always** derived from the trusted context (Authenticated User → ACTIVE StoreMembership → Store); a client-supplied storeId is only ever a membership lookup key, never an authorization source.
- All transition writes run inside `TransactionService.runWithTenant(storeId, ...)` so RLS sees the correct tenant and the pooled connection is never leaked.
- The storefront overlay reuses the same `SubscriptionService` (read-only evaluation) so the rule lives in exactly one place; the storefront resolver remains read-only by construction.

## 10. Subscription lifecycle

Application-enforced state machine (DATABASE §20.2, DOMAIN-MODEL §16.1):

```
TRIAL ──► ACTIVE
  │          │
  │          ▼
  └────► EXPIRED ◄── reactivation EXPIRED -> ACTIVE
```

- `activate()`: TRIAL→ACTIVE and EXPIRED→ACTIVE (reactivation) — guarded `UPDATE ... WHERE store_id = ? AND status = <from>`, sets `activated_at`. Invalid same-state/no-op or illegal transitions throw STATE_TRANSITION (409).
- `markExpired()`: TRIAL→EXPIRED and ACTIVE→EXPIRED — guarded, sets `expires_at`. Already-EXPIRED is an idempotent no-op.
- The TRIAL→EXPIRED transition is also triggered automatically and idempotently by lazy expiry evaluation (below).
- **No billing, no recurring charges, no invoices, no cancellation/refund behavior, no renewal logic** — none of that is documented for the MVP (DATABASE §20.4).

## 11. Trial behavior

- Created atomically with the Store (US-SUB-001: trial associated with Store, has a start date, an expiration date, and tracked status). Rollback-safe: if Store or OWNER-membership creation fails, the trial row is not created (BLOCKED DB test #10).
- `trial_started_at` = creation instant; `trial_ends_at` = `trial_started_at + SUBSCRIPTION_TRIAL_DAYS` (default 14; configurable — BR-SUB-001).
- During trial the Store is operational: reads and writes are allowed (guard passes), storefront is served, checkout works.

## 12. Expiry behavior

- **Lazy evaluation**: on any merchant access that checks the overlay (write guard) or reads the subscription (GET), a TRIAL row with `trial_ends_at <= now` is transitioned TRIAL→EXPIRED via a single guarded conditional UPDATE inside `runWithTenant`. Repeated evaluation is a no-op (idempotent). Boundary rule: `now >= trial_ends_at` is expired (implementation decision, OPEN DECISION #7).
- When EXPIRED:
  - **Merchant dashboard read-only**: merchant writes → `403 FORBIDDEN` (stable `FORBIDDEN` code); reads (GET/HEAD/OPTIONS) still work so the merchant can see the status.
  - **Storefront disabled**: public storefront requests → `404 NOT_FOUND` (no existence leak) regardless of Store status.
  - **Commerce data preserved**: nothing is deleted or modified; retention rules (DATABASE §25) unchanged.
- **Reactivation** EXPIRED→ACTIVE is supported as a guarded lifecycle capability. No production trigger is documented (no billing boundary exists in the MVP) — OPEN DECISION #2.


---

## 13. Access-control behavior

- A single global `SubscriptionAccessGuard` enforces the read-only dashboard overlay at the authorization boundary — no per-module duplication.
- Skips `@Public()` routes (storefront enforces its own overlay via the resolver) and `@SkipTenantContext()` routes (e.g. store creation — no Store yet).
- Evaluates only **writes**; reads are never blocked (read-only dashboard).
- A resolved Store without a subscription row is unrestricted, mirroring the database default `status DEFAULT 'TRIAL'` (DATABASE §7.4) — documented as an implementation decision (OPEN DECISION #6).
- Storefront availability is the **combination** of Store status (ACTIVE only) and the subscription overlay (not EXPIRED) — DOMAIN-MODEL §6.3.

## 14. Tenant isolation

- `subscriptions.store_id UNIQUE` enforces the 1:1 Store→Subscription relationship.
- Every repository read is store-scoped (`findUnique({ where: { storeId } })`); the store id always comes from the trusted tenant context.
- Every transition write is `runWithTenant(storeId)` (RLS-bound, `app.set_current_store_id`).
- Cross-store reads/writes fail closed (403 at the tenant guard / 404 no existence leak at the service).
- RLS defense-in-depth: `member_subscription_select` allows members to read their own store's subscription; writes run through the service role (BLOCKED DB tests #5–#7).

## 15. Authorization

- Identity: AuthGuard (Supabase token, never client-supplied).
- Tenancy: TenantContextGuard (Authenticated User → ACTIVE StoreMembership → Store).
- Role: RolesGuard (fixed OWNER/ADMIN/STAFF; the subscription GET allows any member).
- Subscription access overlay: SubscriptionAccessGuard (writes blocked when EXPIRED). Role and subscription state always come from the database, never from the client.

## 16. Transaction behavior

- **Store creation**: one interactive transaction creates Store + OWNER membership + TRIAL subscription; any failure rolls everything back (BLOCKED DB test #10).
- **Transitions**: guarded conditional UPDATEs (DATABASE §26.2) inside `TransactionService.runWithTenant`; a concurrent double-transition affects at most one row, the loser re-reads (or fails closed on a same-status stale read).
- **Lazy expiry**: idempotent; repeated access after the first transition performs no second write (verified in unit + e2e tests).
- No external provider calls exist in the subscription domain (no billing integration).

## 17. Validation / error handling

- No request DTOs are needed (GET only). Validation errors therefore come from the existing guard chain (401/403/400 TENANT_CONTEXT_REQUIRED).
- Domain errors use the shared taxonomy: `NotFoundError` (404, no row / storefront overlay), `ForbiddenError` (403, expired write), `StateTransitionError` (409, illegal lifecycle transition), `TenantContextRequiredError` (400). All rendered via the API error envelope; no internal fields leak.

## 18. Unit test counts

853 unit tests pass (0 failures) — **+74 vs Phase 13 (779)**:

- `subscription/domain/subscription-status.spec.ts` — 22 tests (states, all FINALIZED transitions, rejected non-FINALIZED transitions incl. PAST_DUE/CANCELLED/SUSPENDED, effective status, boundary date, no-auto-expire semantics).
- `subscription/repositories/subscription.repository.spec.ts` — 4 tests.
- `subscription/services/subscription.service.spec.ts` — 28 tests (trial creation with configured/default duration, GET/TENANT_REQUIRED/NOT_FOUND, lazy expiry + idempotency + concurrent re-read, write-allowed/blocked cases incl. missing row, storefront read-only evaluation, activate/reactivation/illegal same-state/concurrent, markExpired/ACTIVE expiry/idempotent no-op).
- `subscription/services/subscription-access.guard.spec.ts` — 10 tests (public/skip-tenant/read bypass, writes evaluated, expired blocked, forged storeId never trusted).
- `subscription/controllers/subscription.controller.spec.ts` — 1 test.
- `subscription/subscription.types.spec.ts` — 2 tests.
- `storefront/domain/storefront-availability.spec.ts` — +4 tests (overlay).
- `storefront/services/storefront-store-resolver.spec.ts` — +3 tests (overlay).
- `identity/services/store.service.spec.ts` — updated (atomic trial creation assertions, rollback/P2002 never-create).

## 19. E2E test counts

277 E2E tests pass (0 failures) — **+14 vs Phase 13 (263)**:

- `test/subscription.e2e-spec.ts` — 13 new tests through the real guard chain: 401 unauthenticated; multi-store TENANT_CONTEXT_REQUIRED; cross-store 403; GET returns TRIAL / ACTIVE / EXPIRED; lazy TRIAL→EXPIRED transition on access with state mutation; idempotent repeated read (no second write); 404 for missing row; merchant write allowed on TRIAL; merchant write blocked 403 on EXPIRED (and never reaches the repository); merchant read still allowed on EXPIRED; merchant write blocked after lazy expiry.
- `test/storefront.e2e-spec.ts` — +1 overlay test (ACTIVE store with EXPIRED subscription → 404).


---

## 20. Blocked DB / RLS / Supabase tests

`test/subscription-database-tests.blocked.e2e-spec.ts` — **13 `it.todo` items in a `describe.skip` suite** (BLOCKED — PostgreSQL unavailable):

1. `subscriptions.store_id` UNIQUE (1:1) constraint.
2. `subscription_status` enum rejects unknown statuses.
3. `status DEFAULT 'TRIAL'`.
4. `store_id` FK RESTRICT blocks deleting an owning Store.
5. RLS: merchant sees only their own store's subscription.
6. RLS: merchant cannot read another store's subscription.
7. RLS: authenticated role cannot INSERT/UPDATE subscriptions.
8. status index supports expiry sweeps / access-overlay checks.
9. Concurrency: two guarded TRIAL→EXPIRED updates affect exactly one row.
10. Store + OWNER + TRIAL creation rolls back atomically on failure.
11. Subscription rows retained (no DELETE path).
12. Expiry never deletes commerce data.
13. Service-role transition path (incl. reactivation).

## 21. PostgreSQL / Supabase status

- **PostgreSQL: NOT available.** All DB/RLS/concurrency tests are `describe.skip` + `it.todo` (BLOCKED) and are **not** claimed as passed. `prisma validate` and `prisma generate` pass offline; the FINAL schema/migration was reused unchanged.
- **Supabase: NOT available.** No real Supabase interaction was performed for subscriptions (the MVP defines none — no billing/payment integration exists for subscriptions; DATABASE §20.4).

## 22. Open decisions

1. **Subscription plans / monthly / annual subscription.** Roadmap §17 lists "subscription plans", "monthly subscription" and "annual subscription", but the FINAL schema (DATABASE §30: exactly 28 tables) has no plans entity/column/status, and MVP-SCOPE §30 says the pricing/payment model "may be finalized separately". → Not implemented; requires PO approval to add a plans entity (would be a schema change).
2. **Trigger for TRIAL→ACTIVE and EXPIRED→ACTIVE (reactivation).** The transitions are FINALIZED and implemented as guarded internal capabilities, but no documented caller/endpoint exists (no billing/payment automation, DATABASE §20.4; API-SPEC §30 defines only the GET). → PO: define the activation trigger (e.g. a future billing confirmation webhook) before wiring it.
3. **Trigger for ACTIVE→EXPIRED.** DATABASE §7.4 defines `expires_at` as "set on ->EXPIRED" (it records the expiration moment, not a future ACTIVE-period target), so there is no date-based ACTIVE expiry in the MVP. ACTIVE→EXPIRED is implemented as an explicit guarded capability only. → PO: with billing deferred, the ACTIVE period/expiry mechanism is undefined.
4. **`expires_at` on reactivation.** Kept as the record of the last EXPIRED transition (append-friendly); not cleared on EXPIRED→ACTIVE (no documented clearing rule).
5. **Lazy evaluation only; no sweep job.** DATABASE §14.2 documents lazy evaluation + a periodic sweep for inventory reservations, but no subscription sweep job is documented. Only lazy evaluation is implemented. → PO: approve a periodic subscription expiry sweep if desired.
6. **Missing subscription row.** The guard treats a Store without a subscription row as TRIAL (unrestricted), mirroring the DB default; `GET /api/v1/subscription` returns 404 for a missing row. Store creation now always creates the row, so this only affects legacy data. → PO: confirm the desired behavior for inconsistent legacy rows.
7. **Trial-expiry boundary.** `now >= trial_ends_at` is treated as expired (an instant equal to the end date is expired). Not specified by the FINAL documents.
8. **Default trial duration (14 days).** BR-SUB-001 requires configurability, not a specific value. 14 days is the boot default; the product value is a PO decision (change via `SUBSCRIPTION_TRIAL_DAYS`).


---

## 23. Deviations from FINAL documents

**None.** No table, model, column, enum, endpoint, role, lifecycle state, constraint or RLS policy outside the FINAL documents was added, and no schema or migration change was made. The only additions are application-layer implementations of documented behavior plus two documented config/boundary defaults (`SUBSCRIPTION_TRIAL_DAYS` default 14 and the `now >= trial_ends_at` boundary), both reported as OPEN DECISIONS above. Store creation now also creates the TRIAL subscription row — an additive, directly documented change (US-SUB-001, Store 1:1 Subscription) to the Phase 2 transaction.

## 24. Git status / safety

No destructive Git operation was performed (no `reset` / `restore` / `clean` / `checkout`), no commits, no pushes.

**MY CHANGES (Phase 14, uncommitted):**
- New: `apps/api/src/subscription/**` (15 files), `apps/api/test/subscription.e2e-spec.ts`, `apps/api/test/subscription-database-tests.blocked.e2e-spec.ts`, `docs/IMPLEMENTATION-PHASE14-SAAS-SUBSCRIPTION.md`.
- Modified (additive): `apps/api/src/app.module.ts`, `apps/api/src/config/configuration.ts`, `apps/api/src/identity/identity.module.ts`, `apps/api/src/identity/services/store.service.ts`, `apps/api/src/storefront/storefront.module.ts`, `apps/api/src/storefront/domain/storefront-availability.ts`, `apps/api/src/storefront/services/storefront-store-resolver.ts`, the unit specs for those modified files, `.env.example`, `apps/api/.env.example`, and the Prisma stubs in the existing merchant-write/storefront e2e specs (identity, catalog, inventory, customer, cart, checkout, orders, payments, shipping-fulfillment, cms, media, storefront).

**PRE-EXISTING CHANGES (untouched, preserved):** the entire Phase 1–13 uncommitted working tree (schema.prisma, migrations, all prior modules, tests, reports, the modified FINAL docs, `domain-model-diff.txt`, etc.).

`git diff --check` is clean for all Phase 14 files (exit 0). The only `git diff --check` findings are pre-existing trailing whitespace inside `docs/DEVELOPMENT-ROADMAP.md` — a FINAL document not modified in this phase.

## 25. Exact final state and completion verdict

- **Schema/migration: REUSED, not changed.** The FINAL Prisma schema and migration already support subscriptions (table, enum, UNIQUE 1:1, status index, FK RESTRICT, RLS `member_subscription_select`).
- **Endpoint:** `GET /api/v1/subscription` implemented exactly as documented (API-SPEC §30); no undocumented endpoint added.
- **Lifecycle:** TRIAL/ACTIVE/EXPIRED with the exact FINALIZED transitions, guarded and idempotent; no PAST_DUE/CANCELLED/SUSPENDED.
- **Trial:** created atomically with the Store; configurable duration; start/end dates tracked.
- **Expiry overlay:** merchant dashboard read-only (writes 403), storefront disabled (404), commerce data preserved, no automatic deletion; enforced at the authorization boundary and storefront resolver — not duplicated across modules.
- **Validation gates:** TypeScript typecheck PASS; ESLint PASS; Prettier PASS (new/modified files); `nest build` PASS; `prisma validate` PASS; `prisma generate` PASS; 853 unit tests PASS; 277 E2E tests PASS; 262 E2E tests BLOCKED-skipped; `git diff --check` PASS on Phase 14 files.
- **Ambiguities discovered in the FINAL documents** (all reported as OPEN DECISIONS, none silently resolved): subscription plans have no FINAL entity; the ACTIVE/activation triggers are undocumented (no MVP billing); `expires_at` semantics ("set on ->EXPIRED"); no documented subscription sweep job; missing-row semantics; trial boundary instant; default trial duration value.
- **Verdict:** **PASS.**

---

**No later phase was started.**
- Phase 15 (Notifications), Phase 16 (Meta Integration) and all later phases were **NOT** started; no speculative code was added beyond the documented SaaS Subscription phase.

**No speculative features were implemented.** No billing, no recurring charges, no invoices, no plan management, no feature flags/entitlements, no carrier integrations, no analytics, no CRM, no marketing automation.

**No destructive Git operation was performed.** No reset / restore / clean / checkout / commit / push.

**Schema/migration: reused unchanged** — the FINAL schema already supports the documented subscription contract; no migration diff was produced.

**Ambiguity note:** the roadmap's "subscription plans / monthly / annual" wording conflicts with the FINAL schema (which has no plans entity and defers the billing model); per the source-of-truth hierarchy (MVP-SCOPE → DOMAIN-MODEL → DATABASE > ROADMAP) the FINAL schema governs, and plans are reported as OPEN DECISION #1.

---

PHASE 14 — SAAS SUBSCRIPTION COMPLETE.
WAITING FOR EXPLICIT APPROVAL BEFORE ANY FUTURE WORK.

- PostgreSQL is **not available**, so all database/RLS/concurrency tests are BLOCKED (`describe.skip` + `it.todo`, following the established convention). Nothing DB-level is claimed as passed.
