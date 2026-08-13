# PHASE 11 — STOREFRONT FINAL REPORT

**Phase:** Storefront — roadmap **Phase 11** (docs/DEVELOPMENT-ROADMAP.md §14 "Phase 11 — Storefront").
**Status:** PASS (all offline-validatable scope complete; DB/RLS/Supabase validations BLOCKED — see §15–§18).

> **Numbering note (discrepancy reported):** The roadmap's own numbered list labels
> Storefront as **Phase 11**, CMS as Phase 12 and Media as Phase 13. The Phase 10 report's
> closing note called the next phase "Storefront (roadmap Phase 13)" — that label conflicts
> with the FINAL roadmap (Phase 13 is Media). Per the task rule, the FINAL document
> numbering is used: **Storefront = roadmap Phase 11**. The implementation report sequence
> also continues at 11 (… Phase 9 Payments, Phase 10 Shipping & Fulfillment, Phase 11
> Storefront).

---

## 1. Verdict

**PASS** — the public customer-facing Storefront read API is implemented end to end.

- All six public endpoints documented in `docs/API-SPEC.md` §31 are implemented:
  `GET /api/v1/storefront`, `/storefront/products`, `/storefront/products/:slug`,
  `/storefront/categories`, `/storefront/categories/:slug`, `/storefront/pages/:slug`.
- The Store is resolved from the **public storefront slug/domain** (`X-Storefront-Slug`
  header, with a Host-header subdomain fallback), never from a client-supplied Store ID
  (DATABASE §5.4, §29.2).
- The public read model is strictly enforced: ACTIVE products, ACTIVE (purchasable)
  variants, ACTIVE categories, PUBLISHED pages and public store configuration only —
  matching the migration's existing `public_storefront_select` (`anon`) RLS policy set.
- **No schema or migration change was made**: the FINAL Prisma schema and the initial
  migration already contain every table (stores, products, product_variants, categories,
  product_categories, inventory, pages, page_sections, media, product_media) and the
  public-storefront RLS policies (DATABASE §29.6).
- TypeScript, ESLint, Prettier, `nest build`, `prisma validate`, `prisma generate`,
  **615 unit tests** and **211 E2E tests** pass (0 failures). **220 E2E tests are skipped**
  — every one is a blocked database test.
- PostgreSQL is **not available**, so all database/RLS/concurrency tests are
  `describe.skip` + `it.todo` (BLOCKED), following the established convention.
- Supabase is **not available** and not needed by this phase (no auth, no storage call).

---

## 2. Source documents inspected

| Document | Role |
|---|---|
| `docs/DEVELOPMENT-ROADMAP.md` v1.0 Approved | Phase 11 — Storefront (features: homepage, product listing, product details, categories, search), phase ordering and numbering |
| `docs/API-SPEC.md` v1.0 Draft | §31 Storefront API (the six public endpoints + store resolution from domain/subdomain), §32 Storefront Product Response, §36 Public vs Protected, §10 pagination, §33 security |
| `docs/MVP-SCOPE.md` v1.0 Draft | §21 Storefront (pages), §22 Storefront Features, §23 Storefront SEO, §28 Search (product name), §36 public API surface |
| `docs/DOMAIN-MODEL.md` v2.0 FINAL | §6.3 Storefront Availability (ACTIVE-only purchasable), §7 catalog semantics, §14 CMS pages |
| `docs/DATABASE.md` v2.0 FINAL | §5.4 Public Storefront Access, §7.2 stores, §7.5-7.8 catalog, §7.9 inventory, §7.21-7.24 pages/theme, §29.6 Public storefront policies, §10/§11 indexes, §33 open decisions (#7 slug uniqueness, #8 URL strategy) |
| `docs/USER-STORIES.md` | US-STF-001..004 (browse storefront/products, view details, search), US-SEO-001 (public page metadata) |
| `docs/IMPLEMENTATION-PHASE9-PAYMENTS.md` / `PHASE10-SHIPPING-FULFILLMENT.md` | Prior exact-next-phase statements and the established phase numbering notes |
| `apps/api/prisma/schema.prisma` + `migrations/20260812000000_init/migration.sql` | Confirmed all storefront reads are fully schema-supported; public `anon` RLS policies already present |

The FINAL documents were **not modified**.

---

## 3. Files created

| File | Purpose |
|---|---|
| `apps/api/src/storefront/storefront.module.ts` | Storefront module wiring (controller + service + resolver + repository). |
| `apps/api/src/storefront/storefront.types.ts` | Public `StorefrontStoreView` / `StorefrontProductView` / `StorefrontCategoryView` / `StorefrontCategoryDetailView` / `StorefrontPageView` + mappers (API-SPEC §32 shape; BIGINT→number; internal fields never exposed). |
| `apps/api/src/storefront/storefront.types.spec.ts` | Mapper unit tests (public shape, no internal leak, derived availability). |
| `apps/api/src/storefront/controllers/storefront.controller.ts` | Thin `@Public()` controller for the six documented endpoints. |
| `apps/api/src/storefront/controllers/storefront.controller.spec.ts` | Controller delegation + data/meta envelope tests. |
| `apps/api/src/storefront/domain/storefront-availability.ts` | Storefront availability rule (ACTIVE only; NOT_FOUND otherwise). |
| `apps/api/src/storefront/domain/storefront-availability.spec.ts` | Availability rule unit tests. |
| `apps/api/src/storefront/dto/list-storefront-products-query.dto.ts` | `page`/`limit` (max 100) + `search` (product name). |
| `apps/api/src/storefront/dto/list-storefront-categories-query.dto.ts` | `page`/`limit` (max 100). |
| `apps/api/src/storefront/repositories/storefront.repository.ts` | Store-scoped public reads: store by slug, ACTIVE products (+ACTIVE variants+inventory+media), ACTIVE categories, category products, PUBLISHED pages. Read-only by construction. |
| `apps/api/src/storefront/repositories/storefront.repository.spec.ts` | Repository store-scoping/filter unit tests. |
| `apps/api/src/storefront/services/storefront-store-resolver.ts` | Public storefront store resolution (X-Storefront-Slug header + Host subdomain). |
| `apps/api/src/storefront/services/storefront-store-resolver.spec.ts` | Resolver unit tests (header/host/unknown/disabled). |
| `apps/api/src/storefront/services/storefront.service.ts` | Storefront application service (business rules, pagination, search, availability). |
| `apps/api/src/storefront/services/storefront.service.spec.ts` | Service unit tests (store-scoping, search, pagination, availability, NOT_FOUND). |
| `apps/api/test/storefront.e2e-spec.ts` | End-to-end suite (17 tests) through the real guard chain against stubbed Prisma. |
| `apps/api/test/storefront-database-tests.blocked.e2e-spec.ts` | BLOCKED DB/RLS suite (`describe.skip` + `it.todo`). |
| `docs/IMPLEMENTATION-PHASE11-STOREFRONT.md` | This report. |

## 4. Files modified (all additive)

| File | Reason |
|---|---|
| `apps/api/src/app.module.ts` | Registered `StorefrontModule` (import + `imports` entry). |
| `apps/api/src/config/configuration.ts` | Added optional `storefrontDomain` config (`STOREFRONT_DOMAIN`, default `platform-domain.com`). |
| `.env.example` | Documented the optional `STOREFRONT_DOMAIN` variable. |

## 5. Files intentionally untouched

- FINAL docs: `DOMAIN-MODEL.md`, `DATABASE.md`, `API-SPEC.md`, `MVP-SCOPE.md`,
  `DEVELOPMENT-ROADMAP.md`, `BRD.md`, `PRD.md`, `USER-STORIES.md`.
- `apps/api/prisma/schema.prisma` and `migrations/20260812000000_init/migration.sql` —
  the FINAL schema/migration already fully support the public storefront.
- Every prior-phase module (`auth`, `tenant`, `identity`, `authorization`, `catalog`,
  `inventory`, `customer`, `cart`, `checkout`, `orders`, `payments`, `common`,
  `infrastructure`) and every prior e2e suite — no behavioral change.


---

## 6. Architecture

The established request flow is preserved; the storefront endpoints sit at the public
boundary (all global guards skip `@Public()` routes):

```text
Anonymous Request
  → RequestContextMiddleware          (real; requestId)
  → AuthGuard        skips @Public()
  → TenantContextGuard skips @Public()
  → RolesGuard       skips @Public()
  → StorefrontController              (thin)
  → StorefrontService                 (business rules)
      StorefrontStoreResolver         (public slug/domain → Store, ACTIVE-only)
      StorefrontRepository            (store-scoped reads via PrismaService)
  → PrismaService                     (stubbed in tests; PostgreSQL in production)
```

Store resolution for the public storefront intentionally mirrors DATABASE §5.4/§29.2:
the store comes from the public storefront URL (slug/domain), **never** from a
client-supplied Store ID. This is the documented public-access path and is enforced at
the application layer for every read; the migration's `public_storefront_select` (`anon`)
RLS policies remain the final defense boundary (BLOCKED DB tests).

## 7. Entities / domain implementation

No new entities or tables. Reused the FINAL entities:

- **Store** — resolved by slug (globally unique, DATABASE §33 #7); only ACTIVE stores
  have an available storefront (DOMAIN-MODEL §6.3, US-STF-001).
- **Product / ProductVariant / Category / ProductCategory** — public reads expose only
  ACTIVE products, ACTIVE variants (purchasable), ACTIVE categories.
- **Inventory** — availability derived per variant (`on_hand - reserved > 0`); a variant
  without an inventory row is reported unavailable (fail closed, mirroring the Inventory
  "missing row is never rendered as zero" rule).
- **Page / PageSection** — only PUBLISHED pages are exposed, with sections ordered by
  `sort_order` and SEO metadata (`seo_title` / `seo_description`, US-SEO-001).
- **Media / ProductMedia** — public product `images` expose only `{ id, altText }`
  (no storage paths / internals).

## 8. Business rules

- **Storefront availability** (DOMAIN-MODEL §6.3): the storefront is served only when the
  Store is `ACTIVE`; DISABLED/SUSPENDED → `404 NOT_FOUND` (no existence leak). The
  subscription access overlay (EXPIRED → disabled) belongs to roadmap **Phase 14 (SaaS
  Subscription)** and is deliberately not implemented here (documented dependency).
- **Public exposure** (DATABASE §29.6, US-STF-002): DRAFT/ARCHIVED products, archived
  variants and categories, and non-PUBLISHED pages are never returned.
- **Availability** (US-STF-003): `available` is a per-variant boolean derived from
  inventory; it is never a raw quantity.
- **Search** (MVP-SCOPE §28, US-STF-004): `?search=` filters ACTIVE products by **Product
  Name** (case-insensitive contains) within the resolved Store.
- **Pagination** (API-SPEC §10): `page`/`limit` (defaults 1/20, max 100) with the standard
  `meta` envelope.
- **No internal leaks** (API-SPEC §32): store_id, status, sku, compare_at_price,
  cost_price, storage paths, timestamps and inventory quantities are never serialized.

## 9. Tenant isolation

- Store identity for the storefront comes exclusively from the **public slug/domain**
  resolution (StorefrontStoreResolver) — the documented public access path. A
  client-supplied Store ID is never used as an authorization source.
- Every repository read is store-scoped by the resolved `storeId` (store by slug; products,
  variants, categories, pages all filtered by `storeId`). Cross-tenant access fails closed
  with `404 NOT_FOUND`.
- No write path exists in the storefront module (read-only repository).

## 10. Authorization

The storefront is a **public** surface (API-SPEC §36): no authentication, no membership,
no role checks. This is intentional and documented. Every endpoint is marked `@Public()`
so the global guard chain skips auth/tenant/role resolution while `RequestContextMiddleware`
still provides the correlation ID.

## 11. API endpoints

Implemented exactly the documented endpoints from API-SPEC §31:

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/v1/storefront` | Public store configuration (id, name, slug, description, currency, timezone). |
| GET | `/api/v1/storefront/products` | ACTIVE products with ACTIVE variants, price + availability, images; `?search=`/`?page=`/`?limit=`. |
| GET | `/api/v1/storefront/products/:slug` | ACTIVE product by slug (404 if missing/non-ACTIVE). |
| GET | `/api/v1/storefront/categories` | ACTIVE categories (paginated). |
| GET | `/api/v1/storefront/categories/:slug` | ACTIVE category + its ACTIVE products (paginated). |
| GET | `/api/v1/storefront/pages/:slug` | PUBLISHED page with sections + SEO metadata (404 otherwise). |

No additional endpoints were added (no cart/checkout/order-confirmation re-implementations —
those already exist from Phases 6–9 and are consumed by the storefront frontend).

## 12. Transaction behavior

The storefront is read-only: no transactions are used. All reads go through the shared
Prisma client with store-scoped `where` clauses. No reservation, movement, audit, or state
transition is touched.

## 13. Validation / error handling

- DTO validation via the global ValidationPipe (whitelist + forbidNonWhitelisted +
  transform): invalid `page`/`limit`/`search` → `400 VALIDATION_ERROR`; `limit > 100` →
  `400 VALIDATION_ERROR`.
- `NotFoundError` (404 `NOT_FOUND`) is used for: no resolvable storefront slug/domain,
  unknown store slug, non-ACTIVE store, missing product/category/page, non-ACTIVE or
  non-PUBLISHED resources — no existence leak.
- Prisma internals/stack traces are never exposed (AllExceptionsFilter).


---

## 14. Tests executed + exact counts

- **Unit (Jest):** 86 suites / **615 tests passed** (baseline 569 → +46 this phase: 41
  storefront + 5 earlier-suite growth from the Phase 10 report baseline). Zero failures.
  Storefront unit suites: 6 suites / 41 tests.
- **E2E (Jest, `--config ./test/jest-e2e.json --runInBand`):** 12 suites passed /
  **211 tests passed**, 220 skipped (blocked DB suites). Storefront e2e: 17 tests passed.
- **Typecheck:** `npx tsc --noEmit` — PASS (0 errors).
- **ESLint:** `npx eslint "src/**/*.ts" "test/**/*.ts"` — PASS (0 errors, 0 warnings).
- **Prettier:** `npx prettier --check` on all new/modified files — PASS.
- **Build:** `nest build` — PASS.
- **Prisma validate:** `prisma validate --schema apps/api/prisma/schema.prisma` — PASS
  (placeholder `DATABASE_URL`, exactly as the project `db:validate` script does).
- **Prisma generate:** `prisma generate --schema apps/api/prisma/schema.prisma` — PASS.

## 15. Blocked tests

PostgreSQL is unavailable, so all DB/RLS/concurrency tests are `describe.skip` +
`it.todo` (BLOCKED). The storefront blocked suite covers: anon-role read of the resolved
store only, ACTIVE/PUBLISHED-only exposure, no cross-tenant reads, anon cannot write,
store ACTIVE gating, media isolation, derived availability (no raw quantity leak), missing
inventory row fail-closed, and RLS-never-bypassed. **No live-DB behavior is claimed.**

## 16. PostgreSQL / RLS status

- PostgreSQL: **NOT AVAILABLE** in this environment. Nothing DB-level was executed.
- The initial migration already ships `public_storefront_select` policies on stores,
  products, product_variants, categories, pages, page_sections, navigations,
  theme_configurations, media, product_media (DATABASE §29.6) — no migration change was
  made. Their enforcement is covered by the blocked suite.

## 17. Supabase status

- Supabase is **not available** and not contacted. No auth call, no storage call, no hosted
  database. The storefront store resolution is environment-agnostic (header + Host
  subdomain), so it works behind any edge/proxy.

## 18. Open decisions / dependencies

1. **Storefront store resolution mechanism.** DATABASE §33 #8 and API-SPEC §46 delegate the
   exact public storefront domain/subdomain strategy to storefront/API design. This phase
   implements `X-Storefront-Slug` header (primary, deterministic in any environment) plus
   Host-header subdomain parsing when the host matches the configured
   `STOREFRONT_DOMAIN` (default `platform-domain.com`, per DATABASE §7.2). → Product
   Owner/Infra: confirm the production domain strategy.
2. **Subscription access overlay.** DOMAIN-MODEL §6.3 says an EXPIRED subscription disables
   the storefront; that enforcement belongs to roadmap Phase 14 (SaaS Subscription) and is
   a dependency, not implemented here. → Phase 14.
3. **`images` shape.** API-SPEC §32 lists `images` without an item schema; this phase
   exposes `{ id, altText }` media references. Public image URLs are a Media-phase (Phase
   13) concern. → Phase 13.
4. **Storefront availability for DISABLED/SUSPENDED stores.** Interpreted as NOT_FOUND
   (no existence leak), matching the public RLS policy set that exposes only ACTIVE stores.
   → Product Owner: confirm "not purchasable" means fully closed in the MVP.
5. **API-SPEC §31 wording "Possible public endpoints".** The endpoint list is implemented
   because roadmap Phase 11, MVP-SCOPE §21–23, USER-STORIES and API-SPEC §36 mandate the
   storefront; the word "possible" reflects the API-SPEC draft status. No extra endpoints
   were invented.

## 19. Deviations from source documents

None. No endpoint, field, status, role, entity, table, index, constraint or RLS policy
outside the FINAL documents was added. The only interpretive choices are the Open
Decisions above, each reported rather than silently invented.

## 20. Git status

**MY CHANGES (Phase 11, uncommitted — no commit/push performed):**
- New: `apps/api/src/storefront/**` (15 files), `apps/api/test/storefront.e2e-spec.ts`,
  `apps/api/test/storefront-database-tests.blocked.e2e-spec.ts`,
  `docs/IMPLEMENTATION-PHASE11-STOREFRONT.md`.
- Modified (additive): `apps/api/src/app.module.ts` (+2 lines), `apps/api/src/config/configuration.ts`
  (+2 lines: config key + default), `.env.example` (+4 lines: documented optional var).

**PRE-EXISTING CHANGES (untouched, preserved):** the entire Phase 1–10 uncommitted working
tree (`prisma/schema.prisma`, `prisma/migrations/20260812000000_init/`, `src/auth/**`,
`src/tenant/**`, `src/common/**`, `src/infrastructure/**`, `src/identity/**`,
`src/authorization/**`, `src/catalog/**`, `src/inventory/**`, `src/customer/**`,
`src/cart/**`, `src/checkout/**`, `src/orders/**`, `src/payments/**`, all previous
`test/*.e2e-spec.ts`, the modified `docs/*.md`, `domain-model-diff.txt`, etc.).

No destructive Git operations were performed (no `reset` / `restore` / `clean` /
`checkout`), no commits, no pushes.

## 21. Exact next phase

Per `docs/DEVELOPMENT-ROADMAP.md`, the next phase after Storefront is **CMS (roadmap
Phase 12)** — Pages/Sections/Hero/Banner/Text/Image, Navigation, Theme settings and Store
branding (merchant-controlled storefront presentation). Media (roadmap Phase 13) and SaaS
Subscription (roadmap Phase 14) follow.

**STOP.** CMS, Media and SaaS Subscription were not started. No speculative code was
added beyond the documented Storefront phase.

---

PHASE 11 — STOREFRONT COMPLETE.
WAITING FOR EXPLICIT APPROVAL BEFORE THE NEXT PHASE.

