# PHASE 6 — CART FINAL REPORT

**Phase:** Cart (the roadmap's "Phase 7 — Cart"; the implementation sequence labels it Phase 6, mirroring the Phase 4 Inventory numbering note).
**Status:** PASS (all offline-validatable scope complete; DB/RLS/Supabase validations BLOCKED — see §14/§15/§16).

---

## 1. Verdict

**PASS** for all offline-validatable scope.

- The Cart implementation matches the FINAL `DOMAIN-MODEL.md` (§10), `DATABASE.md` (§7.14/§7.15/§10/§11/§17), `API-SPEC.md` (§21) and `DEVELOPMENT-ROADMAP.md` (§10 Cart) contracts.
- The FINAL Prisma schema and the initial migration already contained `carts` and `cart_items` exactly as defined — **no schema or migration change was made**.
- TypeScript, ESLint, Prettier, `nest build`, `prisma validate`, `prisma generate`, 401 unit tests and 129 E2E tests pass.
- PostgreSQL is **not available** in this environment, so all database/RLS/concurrency tests are defined as `describe.skip` + `it.todo` (BLOCKED), following the established convention. No live-DB behavior is claimed.

---

## 2. Files created

| File | Purpose |
|---|---|
| `apps/api/src/cart/cart.module.ts` | Cart module wiring (imports Catalog + Inventory, controller/service/repositories, exports CartService). |
| `apps/api/src/cart/cart.types.ts` | Public `CartView` / `CartItemView` types + mappers (no internal DB fields; prices loaded fresh, non-authoritative). |
| `apps/api/src/cart/controllers/cart.controller.ts` | Thin controller for the five documented endpoints. |
| `apps/api/src/cart/controllers/cart.controller.spec.ts` | Controller delegation unit tests. |
| `apps/api/src/cart/dto/add-cart-item.dto.ts` | `POST /cart/items` body (`variantId`, `quantity`). |
| `apps/api/src/cart/dto/update-cart-item.dto.ts` | `PATCH /cart/items/:itemId` body (`quantity`). |
| `apps/api/src/cart/domain/cart-status.ts` | Cart lifecycle helpers (`assertCartUsable`, `isCartExpiredDue`). |
| `apps/api/src/cart/domain/cart-status.spec.ts` | Lifecycle unit tests. |
| `apps/api/src/cart/domain/cart-guest-token.ts` | Opaque high-entropy server-generated guest token. |
| `apps/api/src/cart/domain/cart-guest-token.spec.ts` | Token unit tests. |
| `apps/api/src/cart/domain/cart-error.mapper.ts` | Prisma error mapping (P2002→CONFLICT, P2025/P2003→NOT_FOUND). |
| `apps/api/src/cart/domain/cart-error.mapper.spec.ts` | Mapper unit tests. |
| `apps/api/src/cart/repositories/cart.repository.ts` | Store-scoped `carts` persistence + guarded lifecycle transition + expiration sweep query. |
| `apps/api/src/cart/repositories/cart.repository.spec.ts` | Repository store-scoping unit tests. |
| `apps/api/src/cart/repositories/cart-item.repository.ts` | Cart-scoped `cart_items` persistence (ownership inherited through the cart). |
| `apps/api/src/cart/repositories/cart-item.repository.spec.ts` | Repository cart-scoping unit tests. |
| `apps/api/src/cart/services/cart.service.ts` | Cart application service (all business rules). |
| `apps/api/src/cart/services/cart.service.spec.ts` | Service unit tests (get/add/update/remove/clear/sweep, errors, tenant). |
| `apps/api/test/cart.e2e-spec.ts` | End-to-end suite (33 tests) through the real guard chain against stubbed Prisma. |
| `apps/api/test/cart-database-tests.blocked.e2e-spec.ts` | BLOCKED DB/RLS/concurrency suite (`describe.skip` + `it.todo`). |
| `docs/IMPLEMENTATION-PHASE6-CART.md` | This report. |

---

## 3. Files modified

| File | Reason |
|---|---|
| `apps/api/src/app.module.ts` | Registered `CartModule` (additive, +2 lines). |
| `apps/api/src/catalog/catalog.module.ts` | Exported `ProductRepository` alongside `ProductVariantRepository` so the Cart module reuses the single catalog ownership implementation (additive, +3 lines). |

No other existing file was modified.

---

## 4. Files intentionally untouched

- All FINAL documents (`DOMAIN-MODEL.md`, `DATABASE.md`, `API-SPEC.md`, `MVP-SCOPE.md`, `DEVELOPMENT-ROADMAP.md`, `PRD.md`, `BRD.md`, `ARCHITECTURE.md`, `USER-STORIES.md`, `AI-AGENT-RULES.md`) — none modified.
- `apps/api/prisma/schema.prisma` and the initial migration — **not modified**. The FINAL schema already contained `Cart`/`CartItem` with all required fields, enums, indexes, FKs, CHECKs and RLS foundation.
- All Phase 1–5 source and tests — untouched (only the two additive lines above).

---

## 5. Architecture implemented

```
Request
  → RequestContextMiddleware        (requestId, AsyncLocalStorage)
  → AuthGuard                       (real; Bearer verified via AuthProvider)
  → TenantContextGuard              (real; Authenticated User → ACTIVE StoreMembership → Store)
  → RolesGuard                      (no @Roles metadata → any authenticated member)
  → CartController                  (thin; only 5 documented routes)
  → CartService                     (business rules)
  → CartRepository / CartItemRepository
  → Prisma                          (all writes inside TransactionService.runWithTenant(storeId, …))
```

Reused modules/infrastructure (no duplication):
- `requireStoreId()` (`catalog/domain/catalog-tenant`) for the trusted tenant store.
- `ProductVariantRepository` + `ProductRepository` (Catalog) for variant/product ownership and status.
- `InventoryService.getInventory` (Inventory) for the availability read (`available = on_hand - reserved`).
- `TransactionService.runWithTenant` + `RlsTenantBinder` for every tenant-scoped write.
- `DomainError` taxonomy, `AllExceptionsFilter`, global `ValidationPipe` (whitelist + forbidNonWhitelisted + transform).


## 6. Cart implementation

- **Identity / session**: guest carts via an opaque server-generated token (`crypto.randomBytes(32)` → base64url). The client carries it in the `X-Guest-Token` header; it is a lookup key **only** — it never authorizes anything. Cart creation requires no client-provided identity; the token is generated server-side on first use and returned in the response so the storefront can persist it.
- **Store/tenant**: every operation is store-scoped through the trusted tenant context. `X-Guest-Token` selects a cart inside that store; an unknown token returns `NOT_FOUND` (no existence leak). All writes run inside `runWithTenant`.
- **Lifecycle** (`cart_status`): `ACTIVE` usable; lazy expiration (ACTIVE + `expires_at` passed → guarded ACTIVE→EXPIRED) on access; mutations on `EXPIRED`/`COMPLETED` fail with `STATE_TRANSITION` (409). A callable `expireDueCarts(batchSize)` sweep (no HTTP endpoint, mirroring the reservation sweep precedent) uses the documented `(store_id, status, expires_at)` index.
- **Pricing**: no price/total is stored (the `cart_items` table has no price column). The view carries the current variant `unitPrice`/`compareAtPrice` for display only — cart pricing is NOT authoritative; checkout revalidates everything.
- **Currency**: `carts.currency` uses the schema default `'EGP'` (the documented store-currency default).
- **Inventory boundary**: availability is validated on add/update (`INSUFFICIENT_INVENTORY` 409); **no reservation, no movement, no stock mutation** — reservation belongs to checkout. A missing inventory row fails closed as insufficient (mirrors the Inventory rule: a missing row is never rendered as zero).
- **Customer boundary**: no customer-cart wiring. `customers.auth_user_id` is reserved for future customer authentication (DATABASE.md §18.2); the `customer_id` identity path is left to that future phase (see §17).

## 7. CartItem implementation

- One line per variant per cart — `UNIQUE (cart_id, variant_id)` (DATABASE.md §7.15). Adding a variant already in the cart **merges** quantity (`existing.quantity + added`), never creating a duplicate line.
- Quantity is a positive integer (`CHECK (quantity > 0)`); DTOs enforce `@IsInt @Min(1)`; zero/negative → `VALIDATION_ERROR` (400). No maximum is invented (none documented).
- **Purchasability** (US-CART-001): a variant can enter a cart only when the variant exists in the current store, is `ACTIVE`, and its product is `ACTIVE`. Missing → `NOT_FOUND`; non-purchasable (archived/unpublished) → `CONFLICT` (409). Updates revalidate the same rules (fail closed).
- Items already in a cart whose variant is later archived remain readable (the cart persists them; `cart_items.variant_id` FK is RESTRICT); checkout will revalidate availability.
- Removal via `DELETE /cart/items/:itemId`; clear via `DELETE /cart/items`.

## 8. Tenant isolation

- Store id is **never** taken from client input as an authorization source: it comes from `Authenticated User → ACTIVE StoreMembership → Store`.
- Every `carts` read is filtered by the trusted `storeId`; every `cart_items` read/write is scoped through the owning cart (which is itself store-scoped). Cross-tenant resource access fails closed with `NOT_FOUND` (no leak of existence).
- Every write uses `TransactionService.runWithTenant(storeId, …)`, which binds `app.set_current_store_id` for the transaction and resets it in `finally` — no pooled-connection tenant leakage. RLS (migration SQL) remains the final defense boundary and is tested in the BLOCKED suite only.

## 9. Authorization

No role restrictions were invented. The Cart endpoints carry no `@Roles()` metadata, so the existing RolesGuard allows any authenticated member (matching every other module's read/list pattern). API-SPEC §21 defines no merchant-role rules for Cart.


## 10. API endpoints

All documented endpoints from `API-SPEC.md` §21 are implemented. No extra endpoints were added.

| Method | Endpoint | Status |
|---|---|---|
| GET | `/api/v1/cart` | 200 — cart view; 404 — no/unknown guest token |
| POST | `/api/v1/cart/items` | 201 — cart view (cart created on first use); 400/404/409 — validation / not found / conflict |
| PATCH | `/api/v1/cart/items/:itemId` | 200 — updated cart view; 400/404/409 |
| DELETE | `/api/v1/cart/items/:itemId` | 204 — removed; 404 |
| DELETE | `/api/v1/cart/items` | 204 — cleared; 404 |

Request headers: `Authorization: Bearer <token>` (global AuthGuard), optional `X-Guest-Token: <opaque token>` for the guest session context. `X-Store-Id` is accepted only as the standard tenant lookup key (403 when it selects a store the user has no membership in).

## 11. Transaction behavior

- **Add item** (cart resolution/creation + line upsert) is atomic inside one `runWithTenant(storeId, …)` transaction: no partial cart/item writes are possible. The duplicate-variant merge and the concurrent P2002 race are handled inside the same boundary.
- **Remove item / clear cart / update quantity / lazy expiration / expiration sweep** each run in a single tenant-bound transaction. All are guarded conditional writes (WHERE store/cart/id/status) so concurrent operations can never double-apply; zero affected rows → typed NOT_FOUND or idempotent no-op.
- Read-only GET operations do not use transactions (no multi-write).
- The availability check inside `addItem` is **advisory** (read via `InventoryService`, outside the write set): Cart does not reserve inventory, and checkout revalidates availability atomically with its guarded reservation (`inventory` guarded UPDATEs, Phase 4).

## 12. Validation / Error Handling

- DTOs: `AddCartItemDto` (`variantId` required string, `quantity` `@IsInt @Min(1)`), `UpdateCartItemDto` (`quantity` `@IsInt @Min(1)`). The global ValidationPipe (whitelist + forbidNonWhitelisted + transform) rejects missing fields, zero/negative/non-integer quantities and undocumented fields (e.g. client `price`/`storeId`) with 400 `VALIDATION_ERROR`.
- DomainError mappings (reused taxonomy):
  - `NOT_FOUND` — unknown/absent guest token, foreign/missing variant or product, item not in the cart, guard-update count 0, P2025/P2003.
  - `CONFLICT` — archived/unpublished variant or product (not purchasable), P2002 duplicate-merge race.
  - `INSUFFICIENT_INVENTORY` — availability < requested quantity, or no inventory row.
  - `STATE_TRANSITION` — mutating an EXPIRED/COMPLETED cart.
  - `TENANT_CONTEXT_REQUIRED` — no resolved store (via `requireStoreId`).
  - `FORBIDDEN`/`UNAUTHORIZED` — produced by the guard chain as in every other module.
- Prisma internals/SQL/stack traces are never exposed (AllExceptionsFilter).


## 13. Tests executed

- **Unit (Jest):** 56 suites / **401 tests passed** (baseline 49 suites / 330 tests → +7 suites / +71 Cart tests). Zero failures.
- **E2E (Jest, `--config ./test/jest-e2e.json --runInBand`):** **129 tests passed**, 138 skipped (the blocked DB suites). Cart e2e: 33 tests passed. Zero failures in executed suites.
- **Typecheck:** `npx tsc --noEmit` — **PASS** (0 errors).
- **ESLint:** `npx eslint "src/**/*.ts" "test/**/*.ts"` — **PASS** (0 errors, 0 warnings).
- **Prettier:** `npx prettier --check` on all new/modified files — **PASS**.
- **Build:** `nest build` — **PASS**.
- **Prisma validate:** `prisma validate --schema apps/api/prisma/schema.prisma` — **PASS** (run with the placeholder `DATABASE_URL` exactly as the project's `db:validate` script does; the bare command needs the env var and cannot connect offline).
- **Prisma generate:** `prisma generate --schema apps/api/prisma/schema.prisma` — **PASS**.

## 14. Tests blocked

PostgreSQL is unavailable, so these DB/RLS/concurrency scenarios are `describe.skip` + `it.todo` in `apps/api/test/cart-database-tests.blocked.e2e-spec.ts` (they did NOT run):

- migration against a clean database
- carts identity CHECK (customer_id OR guest_token), partial UNIQUE (store_id, guest_token), store/customer FKs
- cart_items UNIQUE (cart_id, variant_id), CHECK (quantity > 0), CASCADE/RESTRICT FKs
- RLS policies for `carts` (direct store) and `cart_items` (inherited via parent cart, DATABASE.md §29.4)
- tenant isolation at the database level (Store A vs Store B)
- transaction rollback on failed multi-writes
- concurrency: duplicate-item race → UNIQUE violation exactly once; serialized quantity updates

## 15. PostgreSQL / RLS status

PostgreSQL was **NOT available** (no `DATABASE_URL`, no `psql`, no `.env`). All DB/RLS/concurrency validations are therefore BLOCKED and were not faked. The application code preserves the existing RLS strategy (tenant binding via `RlsTenantBinder` on every write; store-scoped queries everywhere); live RLS behavior is verified only when a database is reachable.

## 16. Supabase status

Supabase credentials were **NOT available** (no `.env`). The E2E suite uses a stubbed `AuthProvider` (exactly the established pattern); real Supabase token verification was not exercised.


## 17. Open decisions / dependencies

Real, unresolved decisions surfaced by this phase (no silent interpretation):

1. **Cart/session identity mechanism.** API-SPEC §21 says "the cart is resolved from the current customer/session context" but defines no mechanism, and the storefront phase is later. This phase implements guest carts identified by a server-generated opaque token carried in the **`X-Guest-Token` header** (the documented "guest/session token" identity, DATABASE.md §17.2). The authenticated-customer path (`carts.customer_id`) is NOT wired because `customers.auth_user_id` is reserved for future customer authentication (DATABASE.md §18.2). → Requires Product Owner confirmation when customer authentication is planned.
2. **Cart lifetime default.** "Cart expiration is supported" (DOMAIN-MODEL.md §10.1) but no default lifetime parameter is defined anywhere. Carts are created without `expires_at`; the lazy-expiration + sweep machinery is implemented and ready. → Product Owner decision needed for the actual default.
3. **GET /cart without an existing cart.** The endpoint returns 404 (GET is non-mutating); the storefront creates the cart on the first `POST /cart/items`. Alternative (auto-creating an empty cart on GET) was rejected as a mutating GET — flagging for confirmation.
4. **Availability on add/update.** Roadmap §10 requires Cart to revalidate inventory; a missing inventory row is treated as insufficient (fail closed, consistent with the Inventory phase's "missing row is never rendered as zero"). Flagged in case a merchant-side "uninitialized inventory = not yet purchasable" rule is preferred.

## 18. Deviations from source documents

None. No FINAL document, schema, or migration was changed. The two additive code changes (`app.module.ts`, `catalog.module.ts` export) are wiring/exposure only. Decisions in §17 follow the highest-authority source (DATABASE → DOMAIN-MODEL → API-SPEC → roadmap → existing patterns) and are explicitly flagged rather than silently invented.

## 19. 152-problem investigation

- **Actual compiler errors:** 0 (`tsc --noEmit` passes for the whole workspace).
- **Actual lint errors:** 0 (`eslint` passes).
- **Actual test failures:** 0 (401 unit + 129 e2e pass; blocked suites are skipped by design).
- **Pre-existing IDE diagnostics:** The earlier IDE "~152 problems" report predates this phase and is not reproducible as compiler errors here. The 5 files where Prettier rewrote formatting after creation are new Cart files; no pre-existing file was reformatted or "fixed" to reduce IDE counts. Baseline (before this phase): tsc 0 errors, 330 unit tests, 96 e2e tests — identical gates were green.


## 20. Git status

**MY CHANGES (Phase 6, uncommitted — no commit/push performed):**
- New: `apps/api/src/cart/**` (21 files), `apps/api/test/cart.e2e-spec.ts`, `apps/api/test/cart-database-tests.blocked.e2e-spec.ts`, `docs/IMPLEMENTATION-PHASE6-CART.md`.
- Modified (additive): `apps/api/src/app.module.ts` (+2 lines), `apps/api/src/catalog/catalog.module.ts` (+3 lines).

**PRE-EXISTING CHANGES (untouched, preserved):** the entire Phase 1–5 uncommitted working tree (`prisma/schema.prisma`, `prisma/migrations/20260812000000_init/`, `src/auth/**`, `src/tenant/**`, `src/common/**`, `src/infrastructure/**`, `src/identity/**`, `src/authorization/**`, `src/catalog/**`, `src/inventory/**`, `src/customer/**`, all previous `test/*.e2e-spec.ts`, the modified `docs/*.md`, `domain-model-diff.txt`, etc.).

No destructive Git operations were performed (no `reset` / `restore` / `clean` / `checkout`), no commits, no pushes.

## 21. Exact next phase

Per `docs/DEVELOPMENT-ROADMAP.md`, the next phase after Cart is **Checkout** (roadmap "Phase 8 — Checkout": cart → validate customer → validate products → validate inventory → calculate prices/totals → reserve inventory → create pending order → initiate payment).

Next phase: **Checkout**. Not started. Waiting for explicit approval.
