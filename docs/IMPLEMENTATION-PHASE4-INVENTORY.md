# Ziad E-commerce — Phase 4: Inventory (Implementation Notes)

**Status:** Implemented & validated offline
**Scope:** Inventory only — Product/ProductVariant/Category reuse, plus the
Inventory API and the reservation lifecycle services. No Customers, Cart,
Orders, Payments, Checkout, CMS, Media or Audit modules were implemented.

> Note on phase numbering: the implementation sequence is Phase 1 Foundation →
> Phase 2 Identity & Tenancy → Phase 3 Catalog → **Phase 4 Inventory** (this
> phase). `docs/DEVELOPMENT-ROADMAP.md` labels this work "Phase 5 — Inventory";
> the roadmap's numbering is offset by the phase-0/design steps. No business
> behavior is affected.

---

## 1. Verdict

Phase 4 is **COMPLETE for all offline-validatable scope**. The Inventory
implementation matches the FINAL `DOMAIN-MODEL.md` / `DATABASE.md` / `API-SPEC.md`
contracts, uses atomic guarded mutations everywhere (no read-then-write
availability decisions), implements the reservation lifecycle exactly
(ACTIVE → CONSUMED | ACTIVE → RELEASED; no EXPIRED/CONVERTED), enforces tenant
isolation, keeps movements append-only, and passes every runnable test.

Database/RLS/concurrency integration tests are **BLOCKED** — PostgreSQL is not
reachable in this environment (see §18). They are written and explicitly marked
blocked; nothing was faked.

## 2. Files created

```
apps/api/src/inventory/
  inventory.module.ts                    module wiring (+ exports for later phases)
  inventory.types.ts                     InventoryView / MovementView / ReservationView
  controllers/inventory.controller.ts    API-SPEC §19 endpoints (thin)
  controllers/inventory.controller.spec.ts
  dto/adjust-inventory.dto.ts            { quantity (signed delta), reason }
  dto/list-movements-query.dto.ts        page / limit (API-SPEC §10)
  domain/inventory-availability.ts       available = on_hand - reserved + guard contract
  domain/inventory-availability.spec.ts
  domain/inventory-error.mapper.ts       Prisma → domain taxonomy
  domain/inventory-error.mapper.spec.ts
  domain/reservation-lifecycle.ts        ACTIVE -> CONSUMED | RELEASED state machine
  domain/reservation-lifecycle.spec.ts
  repositories/inventory.repository.ts   guarded atomic SQL mutations (adjust/reserve/consume/release)
  repositories/inventory-reservation.repository.ts  guarded status transitions + sweep read
  repositories/inventory-movement.repository.ts     append-only movement writes + history read
  services/inventory.service.ts          getInventory / adjust / listMovements
  services/inventory.service.spec.ts
  services/inventory-reservation.service.ts  reserve / release / consume / expireDueReservations
  services/inventory-reservation.service.spec.ts

apps/api/test/inventory.e2e-spec.ts                        (15 e2e tests)
apps/api/test/inventory-database-tests.blocked.e2e-spec.ts (BLOCKED DB suite)
docs/IMPLEMENTATION-PHASE4-INVENTORY.md                     (this report)
```

## 3. Files modified (minimal, additive)

- `apps/api/src/app.module.ts` — registered `InventoryModule` (+2 lines).
- `apps/api/src/catalog/catalog.module.ts` — exported `ProductVariantRepository`
  so variant ownership/tenant rules are resolved by ONE implementation (no
  duplication). Both are the same pattern used by the earlier phases to wire
  new modules.

## 4. Files intentionally untouched

- `docs/DOMAIN-MODEL.md`, `docs/DATABASE.md`, `docs/API-SPEC.md`,
  `docs/MVP-SCOPE.md`, `docs/DEVELOPMENT-ROADMAP.md` (FINAL documents).
- `apps/api/prisma/schema.prisma` and `prisma/migrations/...` — no schema or
  migration change; the FINAL schema already contains inventory /
  inventory_reservations / inventory_movements.
- Phase 1–3 source and tests (except the two additive lines above).
- The pre-existing uncommitted working tree was recorded before work began
  (`git status`) and left in place. No `reset` / `restore` / `clean` /
  `checkout`, no commits, no pushes.

## 5. Architecture

Reused exactly (no new pattern, no new dependency):

```
Request → RequestContextMiddleware → AuthGuard → TenantContextGuard → RolesGuard
       → InventoryController → InventoryService / InventoryReservationService
       → Repositories → Prisma (tenant-bound transactions)
```

- `RequestContextService` (AsyncLocalStorage) — store resolved strictly as
  Authenticated User → ACTIVE StoreMembership → Store.
- `TenantContextService` / `TenantContextGuard` — client-supplied store is only
  a lookup key, never an authorization source.
- `TransactionService.runWithTenant(storeId, ...)` for every write — binds
  `app.set_current_store_id` and resets in `finally`.
- `RlsTenantBinder` — reused as-is.
- `DomainError` taxonomy (`NOT_FOUND`, `CONFLICT`, `STATE_TRANSITION`,
  `INSUFFICIENT_INVENTORY`, `VALIDATION_ERROR`, `TENANT_CONTEXT_REQUIRED`, ...)
  + `AllExceptionsFilter` + global `ValidationPipe`.
- Catalog's `ProductVariantRepository` (exported by `CatalogModule`) reused for
  variant ownership. `requireStoreId` and `buildPaginationMeta`/`PaginatedView`
  are reused from the Catalog module — no duplicate helpers.

## 6. Inventory implementation

- `GET /variants/:variantId/inventory` — returns `{ variantId, onHand, reserved,
  available }`. `available` is **always derived** (`on_hand - reserved`), never
  stored. Variant outside the store, or a variant never initialized (no
  inventory row), fails closed with 404.
- `POST /variants/:variantId/inventory/adjust` — applies a **signed delta** to
  `on_hand_quantity`. First adjustment creates the row explicitly
  (MVP-SCOPE "Set initial inventory"; the Catalog module does not create
  inventory) and records an `INITIAL_STOCK` movement; later adjustments record
  `ADJUSTMENT` movements (both are the documented on_hand-delta movement
  types, §13.5/§28.5). `reason` is required (US-INV-002) and stored verbatim
  on the movement. Zero delta is rejected. A concurrent first-adjustment race
  (UNIQUE `variant_id`) is handled with a single retry against the existing row.
- The guarded adjustment condition is `on_hand + delta >= reserved_quantity`
  — this preserves the FINAL invariant `CHECK (on_hand >= reserved)` and
  subsumes the documented `on_hand + delta >= 0` because `reserved >= 0`
  (§7.9/§13.2/§13.3). Zero rows affected → `INSUFFICIENT_INVENTORY`.

## 7. Reservation implementation

`InventoryReservationService` exposes (service-level only — API-SPEC §19 defines
no reservation endpoints, so no controller was created):

- `reserve(variantId, quantity, { cartId?, orderId? }, expiresAt?)` — requires
  an ACTIVE variant in the current store; at least one of cart/order context
  (DB CHECK); integer positive quantity; future `expires_at`. Atomic guarded
  `reserved = reserved + qty WHERE on_hand - reserved >= qty`; zero rows →
  `INSUFFICIENT_INVENTORY` and **no reservation row is created**. Reservation +
  RESERVATION movement written in the same transaction.
- `consume(reservationId)` / `release(reservationId)` — guarded
  `UPDATE ... WHERE status = 'ACTIVE'` runs FIRST; inventory is decremented and
  the movement written only when the transition affected exactly one row.
- Lifecycle is exactly ACTIVE → CONSUMED | ACTIVE → RELEASED. **EXPIRED /
  CONVERTED / CANCELLED are not states** — expiration is a release path.

## 8. Movement implementation

- Append-only (`inventory_movements`); never updated or deleted.
- Every mutation writes a movement in the same transaction with post-change
  snapshots (`on_hand_after` / `reserved_after`):
  - adjust (row created) → `INITIAL_STOCK`, quantity = signed delta,
    reference_type `adjustment`.
  - adjust (existing row) → `ADJUSTMENT`, quantity = signed delta.
  - reserve → `RESERVATION`, quantity = +qty, reference `reservation`.
  - consume → `CONSUMPTION`, quantity = −qty (on_hand −qty, reserved −qty).
  - release / expiration → `RELEASE`, quantity = −qty (reserved −qty).
- `SALE` is not used (documented as not required by the MVP reservation flow).
- Movement history endpoint is paginated (page/limit, max 100) and
  store-scoped.

## 9. Atomic concurrency behavior

- All four quantity mutations are single-statement atomic guarded UPDATEs
  implemented as raw `$executeRaw` inside the tenant-bound transaction
  (Prisma `updateMany` cannot express column-vs-column guards):
  - adjust: `... WHERE store_id=? AND variant_id=? AND on_hand + delta >= reserved`
  - reserve: `... WHERE store_id=? AND variant_id=? AND on_hand - reserved >= qty`
  - consume/release: store-scoped decrements, executed only after the guarded
    reservation transition applied (1 row).
- No read-then-write availability decision exists anywhere. The pure guard
  helpers (`canAdjust`/`canReserve`) exist only to unit-test the guarded
  contract; enforcement is the SQL guard.
- The unit tests verify the guarded-update contract; real PostgreSQL
  concurrency tests (stock=10, concurrent reserve 7+7 must not yield 14;
  reserve 6 + reserve 4 = available 0; release restores exactly) are in the
  BLOCKED DB suite (§18).

## 10. Tenant isolation

- Store id always from the trusted tenant context (`requireStoreId`).
- Every repository read/write is store-scoped (`store_id` + `variant_id`);
  the tenant-safe composite FKs `(store_id, variant_id)` are the final DB
  defense; RLS policies are defense-in-depth.
- Cross-tenant lookups fail closed with 404 (no existence leak); a client
  `X-Store-Id` for another store → 403 (guarded by TenantContextService).
- E2E tests cover both.

## 11. Authorization

- No inventory-specific role matrix exists in the FINAL documents, so the
  existing boundary is reused: any authenticated member with an ACTIVE
  membership may access inventory endpoints (consistent with the Catalog
  approach). No `@Roles(...)` was invented. The `RolesGuard` still applies
  globally and would enforce any future `@Roles` metadata.

## 12. API endpoints (exactly API-SPEC §19)

| Method | Path | Behavior |
|---|---|---|
| GET  | `/api/v1/variants/:variantId/inventory` | derived inventory view |
| POST | `/api/v1/variants/:variantId/inventory/adjust` | signed-delta adjustment + movement |
| GET  | `/api/v1/variants/:variantId/inventory/movements` | paginated movement history |

No endpoints were invented (no reservation endpoints exist in API-SPEC).
Response envelope: `{ data }` for single resources, `{ data, meta }` for
collections (API-SPEC §7). Status codes: 200, 400 VALIDATION_ERROR,
403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT / INSUFFICIENT_INVENTORY /
STATE_TRANSITION.

## 13. Transaction boundaries

Every multi-row mutation runs inside ONE `TransactionService.runWithTenant`
transaction (DATABASE.md §28): adjustment → inventory update + movement;
reserve → guarded increment + reservation + movement; release/consume →
guarded transition + inventory decrement + movement; expiration → per
reservation transition + decrement + movement (each independently retryable,
§28.6). Any failure rolls back completely. Read-only queries are not wrapped
in transactions.

## 14. Idempotency

- Release/consume: the guarded `WHERE status = 'ACTIVE'` transition is the
  documented idempotency mechanism (§14.3/§27.2). Repeated release on
  RELEASED / consume on CONSUMED is a no-op (no transition, no decrement, no
  movement). Release on CONSUMED / consume on RELEASED is forbidden
  (STATE_TRANSITION). Under a race, the loser re-reads: identical outcome →
  no-op, other outcome → STATE_TRANSITION.
- Reservation/expiration sweep: per-reservation guarded transitions make
  repeated expiration safe and idempotent.
- The FINAL schema has **no idempotency-key column on any inventory table**.
  Client-keyed reserve idempotency belongs to checkout (`orders.idempotency_key`,
  partial UNIQUE) — a later phase. No in-memory/process-local idempotency was
  implemented (the database guard is the mechanism).

## 15. Lifecycle / state machines

- Reservation: ACTIVE → CONSUMED | ACTIVE → RELEASED (exactly).
- EXPIRED / CONVERTED / CANCELLED are NOT states. Expiration =
  ACTIVE → RELEASED via the sweep.
- Variant: reserve requires ACTIVE (archived variants cannot become sellable
  through inventory logic). Merchant inventory management (get/adjust/
  movements) is not restricted by variant status — the FINAL docs impose no
  such restriction.

## 16. Validation / error handling

- class-validator DTOs: signed integer `quantity` (no floats), required
  `reason` (≤ 500), integer `page`/`limit` (1..100).
- Service-level rules: non-zero adjust delta; positive integer reservation
  quantity; at least one cart/order context; future `expires_at`; positive
  sweep batch size.
- Prisma errors mapped consistently with the Catalog mapper (P2002 → CONFLICT,
  P2025/P2003 → NOT_FOUND); everything else passes through and renders as a
  generic INTERNAL_SERVER_ERROR — no SQL/stack traces/credentials leak.

## 17. Exact test counts

- **Unit tests: 43 suites / 285 tests — ALL PASS.** Inventory contributes
  6 suites / 53 tests:
  - inventory-availability: 6, reservation-lifecycle: 6, error mapper: 4,
    InventoryService: 13, InventoryReservationService: 21, controller: 3.
- **E2E tests: 83 tests pass across 5 suites** (foundation, identity, catalog,
  app, inventory). Inventory e2e contributes **15 tests** (auth 401, GET
  inventory, adjust success + validation + insufficient, movements, tenant
  isolation, variant ownership).
- **Skipped: 4 BLOCKED DB suites / 87 `it.todo` entries** (foundation, identity,
  catalog, inventory database suites).

## 18. Blocked tests

`apps/api/test/inventory-database-tests.blocked.e2e-spec.ts` is BLOCKED
(`describe.skip` + `it.todo`), covering the required minimum: migration applies
cleanly; inventory CHECK constraints; reservation quantity/context CHECKs;
tenant-safe composite FKs; inventory/reservation/movement tenant isolation;
atomic reservation under concurrency; insufficient stock under concurrency;
duplicate release/consume; expiration vs consume race; RLS behavior; movement
append-only behavior. Nothing is faked and nothing is claimed as passed.

## 19. PostgreSQL / RLS status

**BLOCKED.** No `.env` exists, and `localhost:5432` does not accept
connections (verified). PostgreSQL/RLS/concurrency tests therefore cannot run;
the prior phases are in the same state. The guarded SQL statements and RLS
tenant binding were validated by typecheck/build and by unit/e2e tests against
stubbed Prisma, not against a live database.

## 20. Supabase status

**BLOCKED** (unchanged from earlier phases). No `SUPABASE_URL` /
`SUPABASE_ANON_KEY`; `SupabaseAuthProvider` fails closed and the e2e suites
stub `AuthProvider`. No Supabase-specific work was required for Inventory.

## 21. Open decisions / dependencies

- **No new dependencies** were added or needed.
- Technical interpretations (documented, deterministic, and non-business):
  1. `INITIAL_STOCK` = first adjustment (row creation); `ADJUSTMENT` = later
     adjustments (both are the documented movement-type pair for on_hand
     deltas — DATABASE.md §13.5/§28.5).
  2. Adjust guard `on_hand + delta >= reserved` (preserves the FINAL
     invariant; subsumes the documented `>= 0`).
  3. Movements are written for reserve/consume/release as well as adjust,
     matching the movement types defined in §13.5 and the "every inventory
     change is committed in the same transaction" rule (§13.4).
  4. `GET inventory` returns 404 when no inventory row exists (inventory is
     initialized explicitly; a missing row is never rendered as zero).
  5. The reservation expiration **sweep unit** (`expireDueReservations`) is
     implemented and callable per Store; **scheduling** it periodically is
     deliberately deferred — it would require a new dependency
     (`@nestjs/schedule`) or an infrastructure decision, and none is added.
- Genuinely out of scope (documented, not implemented): client-keyed reserve
  idempotency (checkout phase, `orders.idempotency_key`).

## 22. Deviations from source documents

None that alter behavior. The FINAL documents were not modified. The two
technical interpretations above (INITIAL_STOCK vs ADJUSTMENT selection and the
strengthened adjust guard) and the reservation-movement writes are documented
in code comments and here; both stay strictly within the documented movement
types and invariants. One observation reported (not fixed): the roadmap calls
this work "Phase 5" while the implementation sequence calls it Phase 4.

## 23. Git status

Working tree recorded before work; no destructive git operations were used, no
commits/pushes. Changes for this phase:
- Untracked (new): `apps/api/src/inventory/**`, `apps/api/test/inventory.e2e-spec.ts`,
  `apps/api/test/inventory-database-tests.blocked.e2e-spec.ts`,
  `docs/IMPLEMENTATION-PHASE4-INVENTORY.md`.
- Modified (additive): `apps/api/src/app.module.ts` (+2 lines),
  `apps/api/src/catalog/catalog.module.ts` (export line).
- The pre-existing uncommitted Phase 1–3 working tree (schema.prisma, filters,
  health controller, docs/*) is untouched by this phase.

## 24. Exact next phase

The next phase in the implementation sequence is **Customers** (then Cart,
Checkout, Orders, Payments — the roadmap's later phases). Inventory is
integration-ready for Checkout via the exported `InventoryReservationService`
(`reserve`/`consume`/`release`/`expireDueReservations`). Per the task
constraints, **no later phase was started.**
