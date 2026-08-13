# PHASE 9 — PAYMENTS FINAL REPORT

**Phase:** Payments (roadmap "Phase 10 — Payments"; the implementation sequence labels it Phase 9, mirroring the Phase 4/6/7/8 numbering notes).
**Status:** PASS (all offline-validatable scope complete; DB/RLS/Supabase validations BLOCKED — see §21–§23).

---

## 1. Verdict

**PASS** for all offline-validatable scope.

- The Payments implementation matches the FINAL `DOMAIN-MODEL.md` (§13 Payment/PaymentAttempt/PaymentEvent, §28 #7/#8), `DATABASE.md` (§7.18–§7.20, §16, §26.2, §27.1, §28.2/§28.3/§28.7, §29), `API-SPEC.md` (§24, §13 Idempotency, §33 Never-trust, §39 External calls), `MVP-SCOPE.md` (§14 Payments, §48 acceptance flow) and `DEVELOPMENT-ROADMAP.md` contracts.
- The FINAL Prisma schema and the initial migration **already contained** `payments`, `payment_attempts`, `payment_events` with every needed column, enum, partial unique index (idempotency keys, provider_reference, webhook dedup), CHECK constraint, retry-scan index and RLS policy. **No schema or migration change was made.**
- TypeScript, ESLint, Prettier (all files changed by this phase), `nest build`, `prisma validate`, `prisma generate`, **569 unit tests** and **183 E2E tests** pass (0 failures). **199 E2E tests are skipped** — every one is a blocked database test.
- PostgreSQL is **not available** in this environment, so all database/RLS/concurrency tests are `describe.skip` + `it.todo` (BLOCKED), following the established convention. No live-DB behavior is claimed.
- Supabase is **not available** (and not needed by this phase): no auth call, no storage call, no hosted database was contacted.
- **Shipping was NOT started** — no shipping/fulfillment/delivery code, endpoints or fields exist.

---

## 2. Source documents inspected

| Document | Role |
|---|---|
| `docs/DOMAIN-MODEL.md` v2.0 FINAL | Payment domain (§13), lifecycle (§28 #7), provider abstraction (§28 #8), checkout boundary (§11) |
| `docs/DATABASE.md` v2.0 FINAL | Payment tables (§7.18–§7.20), payment model (§16), concurrency (§26), idempotency (§27), transaction boundaries (§28), RLS (§29) |
| `docs/API-SPEC.md` v1.0 Draft | Payment API (§24), idempotency (§13), never-trust (§33), transactions (§38), external calls (§39), logging (§40), open decisions (§46) |
| `docs/MVP-SCOPE.md` v1.0 Draft | Payments scope (§14), Paymob stack (§35), end-to-end acceptance flow (§48) |
| `docs/DEVELOPMENT-ROADMAP.md` v1.0 Approved | Phase sequence, security checklist (webhook signature validation, duplicate webhook, idempotency) |
| `docs/IMPLEMENTATION-PHASE7-CHECKOUT.md` | Explicitly deferred payment-record creation to this phase |
| `docs/IMPLEMENTATION-PHASE8-ORDERS.md` | Deferred reservation CONSUMPTION (`ACTIVE → CONSUMED`) and payment-driven `PENDING → CONFIRMED` to this phase |
| `apps/api/prisma/schema.prisma` + `migrations/20260812000000_init/migration.sql` | Confirmed Payments is fully schema-supported |


---

## 3. Files created

| File | Purpose |
|---|---|
| `apps/api/src/payments/payments.module.ts` | Payments module wiring (imports Orders + Inventory; binds PaymentProvider → Paymob). |
| `apps/api/src/payments/payments.types.ts` (+ `.spec.ts`) | `PaymentView` / `PaymentAttemptView` + mappers (BIGINT money → JSON-safe numbers; no floats; internal columns never exposed). |
| `apps/api/src/payments/controllers/payments.controller.ts` (+ `.spec.ts`) | `POST /orders/:orderId/payments` (201, Idempotency-Key header), `GET /orders/:orderId/payment`. |
| `apps/api/src/payments/controllers/paymob-webhook.controller.ts` (+ `.spec.ts`) | `POST /webhooks/paymob` (`@Public()`, signature-gated, safe response). |
| `apps/api/src/payments/domain/payment-lifecycle.ts` (+ `.spec.ts`) | Exact documented state machine `PENDING → PROCESSING → SUCCEEDED/FAILED` (`assertPaymentTransition`) + attempt timestamps (`initiated_at`/`completed_at`). |
| `apps/api/src/payments/domain/payment-error.mapper.ts` (+ `.spec.ts`) | Prisma error mapping (P2002→IDEMPOTENCY_CONFLICT, P2025/P2003→NOT_FOUND) + webhook dedup detection. |
| `apps/api/src/payments/repositories/payment.repository.ts` (+ `.spec.ts`) | `payments` store-scoped CRUD, idempotency lookup, active/latest payment, guarded transition; webhook-only global lookup. |
| `apps/api/src/payments/repositories/payment-attempt.repository.ts` (+ `.spec.ts`) | `payment_attempts` (inherited ownership) create + guarded transition + latest attempt. |
| `apps/api/src/payments/repositories/payment-event.repository.ts` (+ `.spec.ts`) | `payment_events` claim (dedup), resolution (store/payment), PROCESSED/ERROR marking. |
| `apps/api/src/payments/providers/payment-provider.ts` | Provider abstraction (initiate / verify signature / parse event). |
| `apps/api/src/payments/providers/paymob/paymob-hmac.ts` (+ `.spec.ts`) | Paymob transaction-callback HMAC-SHA512 verification (timing-safe compare, fail closed). |
| `apps/api/src/payments/providers/paymob/paymob-payment-provider.ts` (+ `.spec.ts`) | Paymob adapter: auth token → order registration → payment key → iframe URL; webhook signature verification + event mapping; 10 s timeout. |
| `apps/api/src/payments/services/payments.service.ts` (+ `.spec.ts`) | Payment initiation (tenant-scoped, order-derived amount/currency, idempotent, guarded transitions, provider call outside the DB transaction). |
| `apps/api/src/payments/services/paymob-webhook.service.ts` (+ `.spec.ts`) | Webhook processing: verify → claim/dedupe → resolve → guarded transitions → mark PROCESSED. |
| `apps/api/test/payments.e2e-spec.ts` | E2E coverage over the real guard chain (19 tests). |
| `apps/api/test/payments-database-tests.blocked.e2e-spec.ts` | BLOCKED database/RLS/concurrency suite (`describe.skip` + `it.todo`, 23 items). |

---

## 4. Files modified

| File | Change |
|---|---|
| `apps/api/src/app.module.ts` | Registered `PaymentsModule`. |
| `apps/api/src/config/configuration.ts` | Added `PaymobConfig` + `paymob` block (all optional at boot; fail closed at call time). |
| `.env.example` | Added documented `PAYMOB_API_URL/API_KEY/INTEGRATION_ID/IFRAME_ID/HMAC_SECRET` (empty placeholders). |
| `apps/api/src/orders/orders.module.ts` | Exported `OrderRepository` + `AuditLogRepository` (additive) so Payments reuses the Orders lifecycle/audit primitives inside its transaction. |
| `apps/api/src/inventory/services/inventory-reservation.service.ts` | Added `consumeAllForOrderTx` (guarded ACTIVE→CONSUMED + on_hand/reserved decrement + CONSUMPTION movement per reservation, inside the caller's tenant-bound transaction) — the Payment-owned consumption primitive. |
| `apps/api/src/inventory/services/inventory-reservation.service.spec.ts` | Added `findActiveByOrderTx` mock + 3 `consumeAllForOrderTx` tests; repaired a pre-existing time-bomb `expires_at` fixture (fixed date → relative future date) that had begun failing purely from the system clock advancing. |

No existing method, signature, rule or default of a prior phase was changed (only additive additions above).

---

## 5. Files intentionally untouched

- All five FINAL source documents (`docs/DOMAIN-MODEL.md`, `docs/DATABASE.md`, `docs/API-SPEC.md`, `docs/MVP-SCOPE.md`, `docs/DEVELOPMENT-ROADMAP.md`).
- `apps/api/prisma/schema.prisma` and `apps/api/prisma/migrations/**` (Payments is fully schema-supported — no schema change needed).
- All prior-phase modules except the two additive edits in §4: `auth`, `authorization`, `cart`, `catalog`, `checkout`, `customer`, `identity`, `infrastructure`, `tenant`, `prisma`, `common`, `health`.
- `apps/api/src/checkout/**` — checkout still creates the PENDING order only (see §24 Open Decision 1).
- Shipping / fulfillment / delivery / refund / coupon / notification / analytics code (none added).

---

## 6. Architecture

Follows the established chain unchanged:

```text
RequestContextMiddleware → AuthGuard → TenantContextGuard → RolesGuard
        → Controller → Service → Repository → Prisma
```

Reused existing infrastructure: `RequestContextService`, `TenantContextService`, `TransactionService.runWithTenant`, `RlsTenantBinder`, `DomainError`/`AllExceptionsFilter`/`ValidationPipe`, `requireStoreId`, `OrderRepository`, `AuditLogRepository`, `assertOrderTransition`/`transitionTimestamps`, `InventoryReservationService`. No parallel abstraction was introduced beyond the documented Payment Provider interface (`PaymentProvider` → `PaymobPaymentProvider`, per DATABASE §16.2).

---

## 7. Payment model implementation

All persisted columns/enums/constraints come from the existing FINAL schema — nothing was added:

- `payments`: `store_id`, `order_id` (composite store-scoped FK), `status` (`payment_status`: PENDING/PROCESSING/SUCCEEDED/FAILED), `provider`, `provider_reference` (UNIQUE per provider), `amount` (BIGINT minor units, CHECK > 0), `currency` (CHAR(3)), `idempotency_key` (UNIQUE(store_id, key)), `failure_code`, `failure_message`, timestamps.
- `payment_attempts`: inherited ownership through `payment_id`; its own lifecycle, `initiated_at`/`completed_at`, `idempotency_key` UNIQUE within the parent payment.
- `payment_events`: raw provider webhook log, `store_id`/`payment_id` nullable until resolved, `provider_event_id` UNIQUE per provider (dedup), `signature_verified`, `processing_status` (RECEIVED/PROCESSED/ERROR), `error_message`, `processed_at`.
- Money is handled exclusively as BIGINT integer minor units (EGP piastres); conversions to JSON happen only at the view boundary (`Number(bigint)`), never in calculations, and no floating-point arithmetic exists anywhere.


---

## 8. Provider abstraction

`PaymentProvider` (abstract) — `apps/api/src/payments/providers/payment-provider.ts`:

```text
Order domain → Payment domain → PaymentProvider interface → PaymobPaymentProvider
```

- `initiatePayment(input)` — creates the provider checkout session (never called inside a DB transaction).
- `verifyWebhookSignature(payload, hmacFromQuery?)` — fails closed when unconfigured/invalid.
- `parseWebhookEvent(payload)` — maps a verified provider payload into the provider-agnostic `ProviderWebhookEvent`.

The webhook/business layers depend only on this interface; the concrete adapter is bound via DI in `PaymentsModule`. No Stripe/Fawry/COD adapter was added (not in FINAL scope).

---

## 9. Paymob implementation

`PaymobPaymentProvider` implements the hosted-checkout flow:

1. `POST /api/auth/tokens` (`api_key` → token).
2. `POST /api/ecommerce/orders/register` — `amount_cents` (integer minor units), `currency`, `merchant_order_id` = the **payment UUID** (globally unique — see Open Decision 2), `delivery_needed=false`.
3. `POST /api/acceptance/payment_keys` — `integration_id`, `billing_data` built from the order's purchase-time snapshots.
4. Returns `providerReference` (Paymob order id) + `providerCheckoutUrl` (iframe URL with the ephemeral payment token).

Webhook side: `verifyWebhookSignature` validates the Paymob transaction-callback HMAC (SHA-512, documented field concatenation, timing-safe compare; fails closed without `PAYMOB_HMAC_SECRET`), and `parseWebhookEvent` maps the callback into `{ providerEventId, eventType, paymentReference, success, pending, failureMessage }`.

Secrets come exclusively from the environment (`PAYMOB_*` via `ConfigService`). Nothing is hardcoded; provider response bodies and credentials are never logged; HTTP calls have a 10 s timeout (API-SPEC §39).

---

## 10. Payment creation flow

`POST /api/v1/orders/:orderId/payments` (requires `Idempotency-Key`):

1. Tenant from the trusted context (membership → store); order loaded store-scoped (missing/foreign → 404 NOT_FOUND, no existence leak).
2. Only a **PENDING** order is payable (else 409 STATE_TRANSITION).
3. Idempotent replay: same `Idempotency-Key` returns the original payment without a provider call; the same key on a different order → 409 IDEMPOTENCY_CONFLICT.
4. Duplicate rule (§16.4): a new Payment is created **only after the previous one FAILED**; any PENDING/PROCESSING/SUCCEEDED payment blocks initiation (409 CONFLICT).
5. One tenant-bound transaction creates `Payment (PENDING)` + `PaymentAttempt (PENDING)` with `amount = order.grand_total`, `currency = order.currency`, `provider = 'paymob'` (all server-derived; no client-supplied store/order/total/status is accepted).
6. After commit, the provider session is initiated **outside** the transaction (§28.7); success marks both PENDING → PROCESSING with `provider_reference` + `initiated_at`; failure marks both PENDING → PROCESSING → FAILED (documented failure flow) with safe `failure_code`/`failure_message`, and the client receives a stable 409.
7. Response: `PaymentView` with attempts + `providerCheckoutUrl`.

---

## 11. Webhook flow

`POST /api/v1/webhooks/paymob` (`@Public()` — no merchant auth):

1. Verify HMAC signature — fail closed (400) on invalid/unconfigured.
2. Claim a `payment_events` row (`UNIQUE(provider, provider_event_id)`); a duplicate of a PROCESSED event returns `already_processed` (safe 200, no transitions).
3. Resolve the payment via the provider's `merchant_order_id` (payment UUID) — tenant is derived server-side from the payment row; unresolvable events are marked ERROR (kept in the retry scan) and return a safe 200.
4. ONE tenant-bound transaction (§28.2/§28.3): guarded transitions + audit + mark event PROCESSED/resolved.
5. A browser redirect is never authoritative.

---

## 12. Payment lifecycle

Exact documented machine (`payment-lifecycle.ts`): `PENDING → PROCESSING → SUCCEEDED`, or `PENDING → PROCESSING → FAILED`. No direct PENDING→SUCCEEDED/FAILED; SUCCEEDED/FAILED are terminal. Every transition is a guarded conditional UPDATE (`WHERE status = from`); clients can never set payment status — only the provider initiation and the verified webhook drive transitions.


---

## 13. Order integration

Payment success triggers the documented `PENDING → CONFIRMED` transition **through the Orders domain primitives** (`OrderRepository.transitionStatus` + `assertOrderTransition` + `transitionTimestamps`), inside the payment webhook transaction. The Payments layer never writes `order.status` directly. Payment failure never confirms an order. Order status and payment status remain separate state machines (no `payment_status` column on orders).

---

## 14. Reservation consumption

On verified success, the module calls `InventoryReservationService.consumeAllForOrderTx(tx, storeId, orderId)` (new additive primitive that mirrors `releaseAllForOrderTx`): per reservation, guarded `ACTIVE → CONSUMED` first, then the `on_hand`/`reserved` decrement + CONSUMPTION movement — only when the guarded update affected exactly one row. On failure, `releaseAllForOrderTx` releases ACTIVE reservations. Inventory remains the sole owner of reservation state and inventory mutations. Retries never double-consume/release (guarded + idempotent skips).

---

## 15. Idempotency

- Client replay of `Idempotency-Key` → original payment returned, no new rows, no provider call (payments + payment_attempts unique indexes are the DB barrier).
- Provider re-delivery of a webhook → UNIQUE(provider, provider_event_id) dedup; PROCESSED duplicates are no-ops; RECEIVED/ERROR re-processing is safe (all transitions guarded).
- Repeated success webhook → payment already SUCCEEDED (no-op), reservations already CONSUMED (no-op), order already CONFIRMED (transition skipped), event PROCESSED once.
- Failure rollback: a thrown webhook transaction leaves the event RECEIVED so the retry scan re-runs safely.
- Backend keys are generated implicitly by the payment UUID for provider/webhook-driven identity (§27.2).

---

## 16. Tenant isolation

- Every merchant request derives `storeId` from `AuthenticatedUser → ACTIVE StoreMembership → Store` (`requireStoreId`); all queries are store-scoped; foreign ids fail closed with NOT_FOUND.
- Webhook: the tenant is derived server-side from the resolved payment row; client input can never select a tenant.
- RLS remains the final defense (all three payment tables already have RLS policies in the migration — untouched).

---

## 17. Authorization

The FINAL documents define no payment-specific roles, so **no `@Roles()` was added** — any authenticated ACTIVE member may create/read payments (same convention as Orders; Phase 8 Open Decision 8). The webhook is `@Public()` by design (provider-signature is the authentication; DATABASE §29.2).

---

## 18. Transactions

- Initiation: payment+attempt creation (tx 1), provider call (outside), PROCESSING/FAILED marking (tx 2) — external calls never inside DB transactions (§28.7).
- Webhook: verify → claim (plain client) → **one** `runWithTenant(storeId)` transaction applying payment transition + attempt transition + reservation consume/release + order transition + audit + event PROCESSED.

---

## 19. Validation / error handling

Reuses `ValidationPipe`, `DomainError`, `AllExceptionsFilter`, and a Payments error mapper. Error mapping: NOT_FOUND (404), STATE_TRANSITION (409), CONFLICT (409), IDEMPOTENCY_CONFLICT (409), VALIDATION_ERROR (400), UNAUTHORIZED (401), FORBIDDEN (403), generic INTERNAL_SERVER_ERROR. Prisma/SQL/stack traces/provider secrets are never leaked (the filter replaces unknown errors with a generic message; provider failures are logged without credentials).


---

## 20. Tests executed + exact counts

All run in this environment (PostgreSQL/Supabase NOT contacted):

| Gate | Result |
|---|---|
| TypeScript `tsc --noEmit` | PASS |
| ESLint (`src/**` + `test/**`) | PASS |
| Prettier check (all files changed by this phase + touched files) | PASS |
| `nest build` | PASS |
| `prisma validate` | PASS |
| `prisma generate` | PASS |
| Unit tests (`npm run test`) | **569 passed** (80 suites, 0 failed) |
| E2E tests (`npm run test:e2e`) | **183 passed**, 199 skipped (blocked DB suites), 0 failed |

New unit tests this phase: **84** (payments module: lifecycle 10, error mapper 8, repositories 20, types 3, services 23, controllers 5, hmac 7, provider 8 = 84) + **3** `consumeAllForOrderTx` tests added to the existing inventory spec. New E2E: **19** (`payments.e2e-spec.ts`). New blocked DB tests: **23** (`payments-database-tests.blocked.e2e-spec.ts`).

Coverage highlights (as required by the task): payment creation, order ownership, tenant isolation, amount/currency derived from order, provider abstraction, Paymob mapping + HMAC, payment lifecycle transitions, duplicate payment handling, idempotency replay, webhook verification, invalid webhook, duplicate webhook, successful payment, failed payment, order confirmation, reservation consumption, repeated successful webhook, already-confirmed order, already-consumed reservation, failure rollback, error mapping.

---

## 21. Tests blocked

All database/RLS/concurrency tests are `describe.skip` + `it.todo` (BLOCKED — PostgreSQL unavailable), including: unique constraints (idempotency keys, provider_reference, provider_event_id), CHECK constraints, composite store-scoped FKs, guarded-transition concurrency, payment-success vs cancellation races, webhook dedup at the DB level, RLS tenant isolation, NULL-store event visibility, double-consume prevention, audit-row counts. **Nothing in these suites was faked or claimed as passed.**

---

## 22. PostgreSQL / RLS status

**BLOCKED.** No PostgreSQL instance is available. The FINAL migration already enables RLS on `payments`, `payment_attempts`, `payment_events` with `store_id = app.current_store_id()` policies; no RLS policy was modified. Live verification of the webhook service-role requirement (see Open Decision 4) is pending a real database.

---

## 23. Supabase status

**BLOCKED / NOT NEEDED.** Supabase credentials are not present and no Supabase Auth/Storage call was made by this phase. The webhook path's service-role/RLS-bypass deployment requirement (DATABASE §29.2) must be confirmed against the real Supabase connection when available.


---

## 24. Open decisions / dependencies

1. **Checkout does not create payment records.** DATABASE §28.1 step 6 lists "Create Payment (PENDING) + PaymentAttempt (PENDING)" inside the checkout transaction, but API-SPEC §22 says "Create Payment Attempt **if required**", API-SPEC §24 defines a dedicated initiation endpoint, and the Phase 7 report explicitly deferred payment-record creation to this phase. Implemented: `POST /orders/:orderId/payments` creates Payment+Attempt (initiation), checkout is untouched. → Product Owner: confirm whether checkout should pre-create the PENDING payment in the same transaction.
2. **Webhook payment-resolution key.** DATABASE §16.5 step 3 defines no resolution mechanism; `merchant_order_id` must be globally unique for tenant-safe resolution without cross-store scans. Implemented: `merchant_order_id = payment UUID`. → Product Owner/Integration: confirm.
3. **Exact Paymob verification contract.** API-SPEC §46 lists the exact Paymob integration contract and webhook verification mechanism as open decisions. Implemented per Paymob's published transaction-callback HMAC algorithm (field list + order/owner JSON serialization). Must be verified against a live Paymob account before production.
4. **Webhook service-role requirement.** The event claim (store_id NULL) and the global payment lookup assume a service-role (RLS-bypass) connection per DATABASE §29.2. Requires deployment confirmation with the real DATABASE_URL role.
5. **Idempotent replay without persisted checkout URL.** The Paymob payment token/iframe URL is ephemeral and not stored; a replayed Idempotency-Key returns the stored payment state without a fresh iframe URL. A payment stuck PENDING between commit and provider-call (crash window) is returned as-is and cannot be resumed in this MVP.
6. **Audit action strings.** `payment.succeeded`, `payment.failed`, `order.status_changed` follow the documented `entity.action` convention (DATABASE §7.18 covers "payment events" and "order status change"; only `order.cancelled` is an explicit example). → Product Owner: confirm.
7. **`failure_code` values.** `INITIATION_FAILED` (provider-initiation failure) is an implementation data value in the existing nullable `failure_code` column (no new column/enum invented).
8. **Pre-existing Prettier violations** in four prior-phase files (`src/identity/domain/store-slug.ts`, `src/identity/services/store.service.spec.ts`, `src/tenant/tenant-context.guard.ts`, `test/identity-database-tests.blocked.e2e-spec.ts`) fail a whole-repo `prettier --check`; per the phase rules they were **not** modified. All files changed by this phase pass.

---

## 25. Deviations from source documents

None. No endpoint, field, status, transition, role, or DB structure outside the FINAL documents was added. The only interpretive choices are the Open Decisions above (checkout payment-record placement, webhook resolution key, HMAC specifics, audit action strings, failure_code value) — reported rather than silently invented. The webhook's in-transaction sequence places the event claim before resolution exactly as §16.5 describes; the event is resolved to `store_id`/`payment_id` when marked PROCESSED.

---

## 26. Git status and safety confirmation

- No `git reset`, `git restore`, `git clean`, `git checkout`, `git commit` or `git push` was run.
- No previous phase work was deleted or rewritten; the only prior-phase edits are the additive `orders.module.ts` exports, the additive `consumeAllForOrderTx` method, and the two spec-file additions in §4.
- No FINAL source document and no schema/migration was modified.
- Tracked files modified by this phase: `.env.example`, `apps/api/src/app.module.ts`, `apps/api/src/config/configuration.ts`. All Payments source files live under the already-untracked `apps/api/src/payments/` and `apps/api/test/payments*.ts` (the entire implementation is uncommitted, consistent with prior phases).

---

## 27. Exact next phase

**Shipping (roadmap Phase 11)** — order fulfillment (`PROCESSING → SHIPPED → DELIVERED`), delivery information, shipping snapshot handling and any shipping-specific store configuration. The FINAL documents reserve the merchant `PATCH /orders/:orderId/status` path (already implemented in Phase 8) as the mechanism that will drive shipment state.

**STOP.** Shipping was not started and must not be started without explicit approval.

