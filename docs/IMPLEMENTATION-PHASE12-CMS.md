# PHASE 12 — CMS FINAL REPORT

**Phase:** CMS — roadmap **Phase 12** (docs/DEVELOPMENT-ROADMAP.md §15 "Phase 12 — CMS").
**Status:** PASS (all offline-validatable scope complete; DB/RLS/Supabase validations BLOCKED — see §20–§22).

---

## 1. Verdict

**PASS** — the merchant CMS API is implemented end to end.

- All CMS endpoints documented in `docs/API-SPEC.md` §25–§28 are implemented:
  - **Pages** — `GET/POST /api/v1/pages`, `GET/PATCH /api/v1/pages/:pageId`, `POST /api/v1/pages/:pageId/archive`.
  - **Page Sections** — `POST /api/v1/pages/:pageId/sections`, `PATCH/DELETE /api/v1/pages/:pageId/sections/:sectionId`, `POST /api/v1/pages/:pageId/sections/reorder`.
  - **Navigation** — `GET/PUT /api/v1/navigation`.
  - **Theme / Store branding** — `GET/PUT /api/v1/theme` (colors, typography, store-logo reference).
- **No schema or migration change was made**: the FINAL Prisma schema and the initial
  migration already contain the CMS tables (`pages`, `page_sections`, `navigations`,
  `theme_configurations`) and their RLS policy sets (`tenant_isolation_*` for
  `authenticated`, `public_storefront_select` for `anon`). Phase 12 only adds the
  application module on top of that contract.
- Tenant isolation is mandatory and store-scoped: every CMS query is scoped to the
  trusted tenant context (Authenticated User → ACTIVE StoreMembership → Store); every
  CMS write runs inside `TransactionService.runWithTenant(storeId, ...)`. Cross-tenant
  access fails closed with 404/403 (no existence leak).
- TypeScript, ESLint, `nest build`, `prisma validate`, `prisma generate`, Prettier,
  **730 unit tests** and **246 E2E tests** pass (0 failures). **235 E2E tests are skipped**
  — every one is a blocked database test.
- PostgreSQL is **not available**, so all database/RLS/concurrency tests are
  `describe.skip` + `it.todo` (BLOCKED), following the established convention.
- Supabase is **not available** and not contacted (no auth call, no storage call).

---

## 2. Source-of-truth documents inspected

| Document | Role |
|---|---|
| `docs/DEVELOPMENT-ROADMAP.md` v1.0 Approved | Phase 12 — CMS (features: pages, sections, hero/banner/text/image, navigation, theme settings, store branding) + phase numbering |
| `docs/API-SPEC.md` v1.0 Draft | §25 CMS API (pages), §26 Page Sections (incl. the `{ type: "HERO", position: 0, content: {} }` and `sectionIds` examples), §27 Navigation API, §28 Theme API (incl. the `{ primaryColor, fontFamily }` example), §10 pagination, §36 Public vs Protected, §33/§34/§35 security + tenant isolation |
| `docs/MVP-SCOPE.md` v1.0 Draft | §24 Basic CMS (homepage, pages, navigation, basic theme configuration), §25 Homepage Sections (Hero, Banner, Featured Products, Category Grid, Text, Image; configuration-driven; no visual page builder), §26 Theme (logo, primary colors, typography, basic layout) |
| `docs/DOMAIN-MODEL.md` v2.0 FINAL | §14 CMS domain (Page, PageSection, Navigation, ThemeConfiguration; ownership; Page 1:N PageSection; sections have an order) |
| `docs/DATABASE.md` v2.0 FINAL | §7.21 pages (DRAFT/PUBLISHED/ARCHIVED; UNIQUE store slug), §7.22 page_sections (section_type hero/banner/featured_products/category_grid/text/image; content JSONB; sort_order), §7.23 navigations (name + JSONB items), §7.24 theme_configurations (1:1 store; logo_media_id FK media; JSONB config; "created automatically with the Store"), §12 enums, §21 CMS rules (store-scoped; presentation config not core commerce; SEO fields; no visual page-builder; navigation items = label + slug/id), §25.1 retention (draft pages deletable; published/archived retained; navigation/theme administrative changes audited), §29.6 public storefront, §33 open decision #11 (JSONB accepted) |
| `docs/BRD.md` | BR-CMS-001..004 (pages, sections, navigation, theme/branding) |
| `docs/PRD.md` | §29 CMS (sections can be reordered) |
| `docs/USER-STORIES.md` | US-CMS-001..004 (manage pages, homepage sections, reorder sections, configure theme) |
| `docs/AI-AGENT-RULES.md` | §28 CMS rules (CMS controls presentation; CMS must NOT modify orders/payments/inventory/customers) |
| `docs/IMPLEMENTATION-PHASE11-STOREFRONT.md` | Prior exact-next-phase statement, established phase numbering, and the precedent that the FINAL schema/migration already ships the CMS tables + RLS policies |

---

## 3. Exact CMS scope implemented

1. **Pages** — list / create / get / update / archive, with the DRAFT/PUBLISHED/ARCHIVED
   lifecycle, store-scoped unique slugs, SEO fields.
2. **Sections** — add / update / delete / reorder for the six documented section types,
   with a defined (dense) order.
3. **Navigation** — get / replace the storefront navigation (singleton resource),
   items referencing Pages, Categories and Storefront destinations.
4. **Theme settings / Store branding** — get / replace the theme configuration
   (primaryColor, fontFamily) and the store-logo reference.
5. **Storefront integration** — verified that the Phase 11 public storefront already
   consumes PUBLISHED pages (`GET /api/v1/storefront/pages/:slug`); no storefront
   rewrite and no new public endpoints were added (API-SPEC §31 does not document
   public navigation/theme endpoints).

Not implemented (per the STOP condition): Media (Phase 13), SaaS Subscription
(Phase 14) and any later phase. No media upload, no storage integration.

---

## 4. Files created

New module `apps/api/src/cms/` (49 files):

- Module/wiring: `cms.module.ts`, `cms.types.ts`.
- Controllers (4): `controllers/pages.controller.ts`, `controllers/page-sections.controller.ts`,
  `controllers/navigation.controller.ts`, `controllers/theme.controller.ts` (+ 4 controller specs).
- Domain (5): `domain/cms-status.ts`, `domain/cms-section.ts`, `domain/cms-theme.ts`,
  `domain/cms-navigation.ts`, `domain/cms-error.mapper.ts` (+ 4 domain specs).
- DTOs (9): `dto/create-page.dto.ts`, `dto/update-page.dto.ts`, `dto/list-pages-query.dto.ts`,
  `dto/create-page-section.dto.ts`, `dto/update-page-section.dto.ts`,
  `dto/reorder-page-sections.dto.ts`, `dto/update-navigation.dto.ts`, `dto/navigation-item.dto.ts`,
  `dto/update-theme.dto.ts`.
- Repositories (4): `repositories/page.repository.ts`, `repositories/page-section.repository.ts`,
  `repositories/navigation.repository.ts`, `repositories/theme.repository.ts` (+ 4 repository specs).
- Services (5): `services/pages.service.ts`, `services/page-sections.service.ts`,
  `services/navigation.service.ts`, `services/theme.service.ts`, `services/cms-audit.service.ts`
  (+ 4 service specs).
- Tests: `apps/api/test/cms.e2e-spec.ts` (35 E2E cases), `apps/api/test/cms-database-tests.blocked.e2e-spec.ts` (15 blocked `it.todo`).
- Report: `docs/IMPLEMENTATION-PHASE12-CMS.md`.

## 5. Files modified

- `apps/api/src/app.module.ts` — additive: imported and registered `CmsModule` (+2 lines).

No other pre-existing file was modified.

## 6. Files intentionally untouched

- `apps/api/prisma/schema.prisma` and `apps/api/prisma/migrations/20260812000000_init/`
  (the FINAL CMS tables and RLS policies already exist — no migration change).
- `apps/api/src/storefront/**` (Phase 11) — already consumes PUBLISHED pages; no rewrite.
- `apps/api/src/identity/**`, `apps/api/src/catalog/**`, `apps/api/src/inventory/**`,
  `apps/api/src/customer/**`, `apps/api/src/cart/**`, `apps/api/src/checkout/**`,
  `apps/api/src/orders/**`, `apps/api/src/payments/**`, `apps/api/src/auth/**`,
  `apps/api/src/tenant/**`, `apps/api/src/authorization/**`, `apps/api/src/common/**`,
  `apps/api/src/infrastructure/**`, `apps/api/src/config/**`, `apps/api/src/health/**`,
  `apps/api/test/*.e2e-spec.ts` (previous phases) — untouched.
- All FINAL documents (`docs/DOMAIN-MODEL.md`, `docs/DATABASE.md`, `docs/API-SPEC.md`,
  `docs/MVP-SCOPE.md`, `docs/DEVELOPMENT-ROADMAP.md`, ...) — untouched.
- Previous implementation reports — untouched.

---

## 7. Architecture

Follows the established module architecture exactly:

```text
Controller -> Service -> Repository -> Prisma
```

- Controllers are thin, delegate to services, wrap responses in the `{ data, meta }` envelope
  (API-SPEC §7).
- Services implement the business rules (lifecycle, slugs, ordering, tenant scoping, audit).
- Repositories encapsulate Prisma access and are store-scoped by construction.
- Reused established infrastructure (no duplication):
  - `requireStoreId` from `catalog/domain/catalog-tenant` (the same cross-module import the
    Orders phase already uses).
  - `slugify` / `assertValidCatalogSlug` from `catalog/domain/catalog-slug`.
  - `buildPaginationMeta` / `PaginatedView` from `catalog/catalog.types`.
  - `TransactionService.runWithTenant` for every CMS write.
  - `AuthGuard` → `TenantContextGuard` → `RolesGuard` (global).
  - `DomainError` taxonomy + `AllExceptionsFilter` + global `ValidationPipe`
    (whitelist / forbidNonWhitelisted / transform).
  - `UserRepository` (IdentityModule) + `AuditLogRepository` (OrdersModule) for the audit trail.

## 8. Pages implementation

Model (FINAL schema, reused exactly): `pages` — id, store_id, title, slug, status
(DRAFT/PUBLISHED/ARCHIVED), seo_title, seo_description, timestamps; `UNIQUE (store_id, slug)`;
composite `UNIQUE (store_id, id)` FK target.

Endpoints (API-SPEC §25):
- `GET /api/v1/pages` — store-scoped list, paginated (page=1, limit=20, max 100).
- `POST /api/v1/pages` — creates a **DRAFT** page; slug generated from `title`
  (URL-safe, store-scoped unique, `-2`/`-3` collision resolution — the exact Catalog
  convention); SEO fields optional.
- `GET /api/v1/pages/:pageId` — page with its sections in defined order.
- `PATCH /api/v1/pages/:pageId` — partial update of title/SEO; `status` accepts
  DRAFT | PUBLISHED only and drives the publish/unpublish transitions (see §8.1).
- `POST /api/v1/pages/:pageId/archive` — DRAFT | PUBLISHED → ARCHIVED (terminal).

### 8.1 Page lifecycle (documented interpretation)

`docs/API-SPEC.md` §25 documents the page endpoints but NO dedicated publish/unpublish
endpoint (unlike products). The FINAL domain/database defines page_status
DRAFT/PUBLISHED/ARCHIVED and the storefront/RLS expose only PUBLISHED pages, so a
publish path MUST exist. The interpretation implemented: **publishing/unpublishing goes
through `PATCH /pages/:pageId` `status`** (DRAFT↔PUBLISHED, idempotent same-status no-op),
while ARCHIVED is reached exclusively through the dedicated archive endpoint. This is
reported as an OPEN DECISION (§23).

Transitions are enforced in two layers (DATABASE §26.2): a pure state rule
(`domain/cms-status.ts`) pre-checks the source state (STATE_TRANSITION on illegal moves)
and a **guarded conditional UPDATE** (`WHERE status = current`) inside the tenant-bound
transaction fails closed when a concurrent request already moved the page. ARCHIVED is
terminal.

### 8.2 Slug rules

Slug = `slugify(title)` (lowercase alphanumerics + hyphens, 1–100 chars, no leading/
trailing hyphen), store-scoped unique with automatic suffix resolution. The slug is
**stable after creation** — renaming a title never rewrites public SEO URLs (matches the
Catalog convention; reported in §23). `status` is never accepted on create (DRAFT only).

## 9. Sections implementation

Model (FINAL schema, reused exactly): `page_sections` — id, store_id, page_id, section_type
(hero / banner / featured_products / category_grid / text / image), content JSONB,
sort_order, timestamps; composite store-scoped FK `(store_id, page_id) → pages`
ON DELETE CASCADE.

Endpoints (API-SPEC §26):
- `POST /api/v1/pages/:pageId/sections` — body `{ type, position, content }` per the
  API-SPEC example; `type` accepts the documented UPPERCASE values and is mapped to the
  FINAL lowercase database values; `position` maps to `sort_order` (default 0).
- `PATCH /api/v1/pages/:pageId/sections/:sectionId` — partial update of type/content;
  `position` moves the section (see §9.1).
- `DELETE /api/v1/pages/:pageId/sections/:sectionId` — 204 No Content (the DELETE
  convention used by Cart/Catalog); 404 when absent.
- `POST /api/v1/pages/:pageId/sections/reorder` — body `{ sectionIds }` per the API-SPEC
  example; the list must be a **permutation** of the page's current sections (complete
  reorder); duplicate or unknown ids are rejected with 400.

### 9.1 Defined order

US-CMS-002/003 require a defined order and that the storefront reflects it. The
implementation keeps the order **dense (0..n-1)**: inserting at `position` shifts the
following sections up by one inside the same transaction; a `position` update moves the
section and re-densifies; reorder replaces the full order. Sections are always loaded
ordered by `sort_order` (merchant view AND the Phase 11 public storefront page view).

### 9.2 Section content

Content is a free-form JSON object (DATABASE §33 #11 — JSONB accepted for presentation
content; NO per-section-type content schema is documented). Validation enforces the object
shape only (rejects null/array/string). Per-type schemas (hero title/CTA, image url, ...)
are not defined by the source documents — reported in §23.

## 10. Navigation implementation

Model (FINAL schema, reused exactly): `navigations` — id, store_id, name, items JSONB, timestamps.

Endpoints (API-SPEC §27):
- `GET /api/v1/navigation` — returns the store's navigation. The API contract treats
  navigation as a **singleton** store resource; when no row exists the service
  materializes a default (`name: "Main"`, `items: []`) inside a tenant-bound transaction
  (get-or-create, same pattern as the default theme).
- `PUT /api/v1/navigation` — replaces the whole navigation (`name` + `items`) and writes an
  append-only `audit_logs` row (`navigation.updated`), because navigation is current-state
  config whose administrative changes are audited (DATABASE §21.3/§25.1).

Item shape (documented interpretation): DATABASE §7.23/§21.2 defines items as "label +
slug/id" referencing Pages, Categories and Storefront destinations. The minimal
discriminated shape implemented is `{ label, type: PAGE|CATEGORY|DESTINATION, value }`
where `value` is the page/category id or the destination slug. Items are validated for
**shape only** — navigation is presentation configuration, not core commerce data
(DATABASE §21.2), and the source documents define no referential integrity into
pages/categories. See OPEN DECISIONS (§23).

## 11. Theme settings implementation

Model (FINAL schema, reused exactly): `theme_configurations` — id, store_id (UNIQUE 1:1),
logo_media_id (FK media ON DELETE SET NULL), config JSONB, timestamps.

Endpoints (API-SPEC §28):
- `GET /api/v1/theme` — returns the store's theme configuration. DATABASE §7.24 says the
  theme is "Created automatically with the Store (default theme)". The Phase 2 store
  creation predates the CMS module and does not create it; the service therefore
  materializes the default row (`config: {}`) lazily (get-or-create), preserving the
  documented 1:1 invariant without rewriting Phase 2 code (see OPEN DECISIONS §23).
- `PUT /api/v1/theme` — replaces the documented config properties and audits the change
  (`theme.updated`, DATABASE §21.3/§25.1).

The documented API-SPEC §28 request example defines exactly two config properties:
`primaryColor` (6-digit hex) and `fontFamily` (≤100 chars). The stored `config` JSONB
contains exactly those keys; PUT uses full-replacement semantics (the previous GET response
is the contract for the next PUT). No additional theme options were invented.

## 12. Store branding implementation

Store branding is represented by `theme_configurations.logo_media_id` (store logo
reference — DATABASE §7.24) plus the visual `config`. `PUT /theme` accepts an optional
`logoMediaId` that is validated **store-scoped** (the media row must exist in the current
store, else 404 fail-closed) and persisted as the logo reference. Binary uploads are a
Media-phase (Phase 13) concern — this phase only manages the reference, exactly as the
FINAL schema supports it. Media upload, storage and URLs were NOT implemented.

## 13. Storefront integration

The Phase 11 storefront already consumes the documented CMS data: `GET /api/v1/storefront/pages/:slug`
returns PUBLISHED pages with their ordered sections and SEO metadata (verified — no change
was needed). The public `anon` RLS policy set for `page_sections`/`navigations`/
`theme_configurations` already exists in the migration. API-SPEC §31 documents the public
storefront endpoints and does NOT include public navigation/theme endpoints, so **no new
public endpoints were added** (see OPEN DECISIONS §23). No storefront code was rewritten.

## 14. Tenant isolation

- Store ID is NEVER trusted from client input. Every CMS operation resolves the store from
  the trusted context (Authenticated User → ACTIVE StoreMembership → Store) via
  `requireStoreId(this.requestContext)`.
- Every repository read is store-scoped (composite `storeId_id` unique for pages; explicit
  `storeId` filters everywhere; `updateMany WHERE id + storeId` for navigation/theme because
  those tables lack a composite unique).
- Every CMS write runs inside `TransactionService.runWithTenant(storeId, ...)`, which binds
  the DB session GUC for RLS and resets it in `finally`.
- Missing or foreign resources fail closed with 404 (no existence leak); a client-selected
  store without membership fails with 403. RLS policies in the migration are the final
  defense boundary (BLOCKED DB tests).

## 15. Authorization

API-SPEC §36 classifies CMS management as **Protected**. The FINAL documents define no
role restriction for CMS operations, so the established project convention is used:
**any authenticated merchant with an ACTIVE StoreMembership** (OWNER/ADMIN/STAFF) can
manage CMS — no `@Roles(...)` decorator on CMS controllers (identical to Catalog, Orders,
Inventory). The global guard chain (AuthGuard → TenantContextGuard → RolesGuard) enforces
authentication + tenant resolution for every CMS route; `@Public` routes are NOT used in
this module. This convention is recorded as an OPEN DECISION (§23).

## 16. API endpoints (implemented exactly as documented)

| Method | Path | Status | Purpose |
|---|---|---|---|
| GET | `/api/v1/pages` | 200 | List pages (paginated) |
| POST | `/api/v1/pages` | 201 | Create DRAFT page |
| GET | `/api/v1/pages/:pageId` | 200 | Get page + sections |
| PATCH | `/api/v1/pages/:pageId` | 200 | Update fields / publish / unpublish |
| POST | `/api/v1/pages/:pageId/archive` | 200 | Archive (terminal) |
| POST | `/api/v1/pages/:pageId/sections` | 201 | Add section |
| PATCH | `/api/v1/pages/:pageId/sections/:sectionId` | 200 | Update section |
| DELETE | `/api/v1/pages/:pageId/sections/:sectionId` | 204 | Delete section |
| POST | `/api/v1/pages/:pageId/sections/reorder` | 200 | Reorder sections |
| GET | `/api/v1/navigation` | 200 | Get navigation (default materialized) |
| PUT | `/api/v1/navigation` | 200 | Replace navigation + audit |
| GET | `/api/v1/theme` | 200 | Get theme (default materialized) |
| PUT | `/api/v1/theme` | 200 | Replace theme config + logo ref + audit |

No endpoint outside the documented set was added. No Media (Phase 13), Subscription
(Phase 14) or later-phase endpoint was implemented.

## 17. Transactions

Every CMS write is wrapped in `TransactionService.runWithTenant(storeId, ...)` so RLS sees
the correct tenant and multi-row mutations are atomic:

- **Page + slug uniqueness**: create resolves the store-scoped slug and inserts the page in
  one transaction.
- **Page lifecycle**: the guarded status transition + field updates are a single UPDATE;
  a concurrent transition yields `STATE_TRANSITION` (409).
- **Section insertion**: the shift (`sortOrder` increment) + insert happen in one transaction.
- **Section move/reorder**: all order writes happen in one transaction.
- **Navigation / Theme update**: resolve-or-create + update + audit row in one transaction.

Simple reads are not wrapped in transactions (established convention).

## 18. Validation / error handling

- Global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) applies to all
  CMS DTOs: unknown body/query fields → 400 `VALIDATION_ERROR`.
- DTO validation: required title, optional SEO fields, `status` restricted to
  DRAFT | PUBLISHED (ARCHIVED rejected), section `type` restricted to the six documented
  types, `content` must be a JSON object, navigation item shape, theme hex color,
  pagination (page ≥ 1, limit 1..100).
- Domain-layer defense in depth: slug rules, section content shape, navigation item shape,
  lifecycle transitions, dense ordering.
- Errors use the shared taxonomy + `AllExceptionsFilter`: NOT_FOUND (404), CONFLICT (409),
  STATE_TRANSITION (409), VALIDATION_ERROR (400), FORBIDDEN (403), UNAUTHORIZED (401),
  TENANT_CONTEXT_REQUIRED (400). Prisma internals (P2002/P2025/P2003) are mapped via
  `cms-error.mapper.ts`; anything unrecognized becomes a generic INTERNAL_SERVER_ERROR.
- Responses never expose `store_id`, timestamps or other internal columns.

## 19. Tests executed

**Unit tests (Jest)** — 730 passed, 0 failed (115 new CMS tests):
- `src/cms/domain/*.spec.ts` — lifecycle transitions (publish/unpublish/archive, terminal
  ARCHIVED, idempotent same-status), section type mapping + content shape, theme config /
  hex color rules, navigation item shape rules.
- `src/cms/services/*.spec.ts` — pages (create/slug collision/list/get/update/publish/
  unpublish/archive/guarded-transition failure), sections (add with shift/update/move/
  delete/reorder permutation/orderedAfterMove), navigation (get-or-create/update/audit/
  malformed items), theme (get-or-create/update/audit/logo validation).
- `src/cms/repositories/*.spec.ts` — store-scoping, guarded `WHERE status = current`,
  composite storeId_id targets, composite storeId+pageId section scoping, navigation/theme
  `WHERE id + storeId` writes.
- `src/cms/controllers/*.spec.ts` — thin delegation + data/meta envelope.
- All previous-phase unit suites still pass (no regressions).

**E2E tests (supertest, real guard chain + stubbed Prisma)** — 246 passed, 0 failed
(35 new CMS tests in `test/cms.e2e-spec.ts`):
- 401 on every CMS route without a token; tenant resolution via ACTIVE membership.
- Pages: list pagination, create DRAFT + generated unique slug, slug collision `-2`,
  get with ordered sections, 404 for foreign page, field update (slug stable), publish/
  unpublish via PATCH, ARCHIVED status rejected, forbidNonWhitelisted, archive + 409 on
  re-archive, limit cap.
- Sections: add at position (dense order verified through the page view), unknown type
  rejected, non-object content rejected, update (type/content/position), 404 unknown
  section, delete 204 + 404 on repeat, reorder full list, incomplete reorder rejected,
  404 for missing page.
- Navigation: default materialization, PUT replace + audit row (`navigation.updated`),
  GET returns stored, malformed items rejected.
- Theme: default materialization, PUT config replace + audit row (`theme.updated`),
  invalid hex rejected, out-of-store logo reference 404, in-store logo accepted.
- Tenant isolation: X-Store-Id without membership → 403; foreign page id → 404.
- No internal column leaks (`storeId` absent from responses).

## 20. Tests blocked

- **15 CMS database/RLS tests** (`test/cms-database-tests.blocked.e2e-spec.ts`) are
  `describe.skip` + `it.todo` — they require a real PostgreSQL instance with the FINAL
  migration applied, RLS enabled and Supabase-compatible roles. Nothing is faked.
  BLOCKED — PostgreSQL unavailable.
- All 220 pre-existing blocked database tests from Phases 1–11 remain `it.todo`.

## 21. PostgreSQL/RLS status

**BLOCKED — PostgreSQL unavailable.** No `.env`, no `psql`, no reachable database in this
environment. Nothing DB-level was executed; RLS enforcement, FK/unique constraints, guarded
-transition concurrency and public `anon` policies on the CMS tables are NOT claimed as
passed — they are covered by the blocked suite and the pre-existing migration SQL.

## 22. Supabase status

**BLOCKED / not applicable.** Supabase is not available and not contacted. Phase 12 makes
no auth call (the established AuthProvider abstraction + e2e stub are used) and no storage
call (media upload is Phase 13). No credentials were added anywhere.

## 23. Open decisions

1. **Page publish/unpublish path.** API-SPEC §25 documents page list/create/get/update/
   archive but no dedicated publish endpoint. Interpretation: `PATCH /pages/:pageId`
   `status` (DRAFT↔PUBLISHED, idempotent) publishes/unpublishes; ARCHIVED is reachable only
   through the dedicated archive endpoint. → Product Owner: confirm publish via PATCH status
   is acceptable.
2. **Slug stability on rename.** DATABASE §7.21 defines the page slug as a store-scoped
   SEO URL but is silent on renames. Implemented: slug is generated at create and STABLE
   thereafter (matches the Catalog convention; renaming never rewrites public URLs).
   → Product Owner: confirm.
3. **Navigation item shape.** DATABASE §7.23/§21.2 defines items as "label + slug/id"
   referencing Pages, Categories and destinations but no item schema. Implemented:
   `{ label, type: PAGE|CATEGORY|DESTINATION, value }` (a type discriminator is required to
   interpret the reference). Items are validated for shape only (no referential integrity
   is defined). → Product Owner: confirm the item contract.
4. **Theme config properties.** MVP-SCOPE/BRD list "primary colors, typography, basic
   layout" as theme capabilities; API-SPEC §28 documents exactly `primaryColor` +
   `fontFamily` in the request example. Implemented: the two documented properties only;
   the JSONB `config` stores exactly those keys with PUT full-replacement semantics.
   → Product Owner: confirm the minimal property set.
5. **Default theme/navigation materialization.** DATABASE §7.24 says the theme is created
   automatically with the Store, but Phase 2 store creation does not create it. Implemented:
   get-or-create at the CMS layer (default `config: {}`, default navigation `Main`/`[]`)
   inside a tenant-bound transaction, preserving the invariant without rewriting Phase 2.
   → Product Owner: confirm lazy materialization is acceptable.
6. **Section content schema.** DATABASE §33 #11 accepts JSONB for section content but
   defines no per-section-type schema. Implemented: content validated as a JSON object only.
   → Product Owner: confirm per-type content contracts before the storefront renders them.
7. **Authorization scope.** No role restriction is documented for CMS. Implemented: any
   ACTIVE membership (OWNER/ADMIN/STAFF), matching the established project convention.
8. **Public navigation/theme endpoints.** API-SPEC §31 does not list them; only public
   pages are documented. Not implemented. → Product Owner/Storefront: confirm where
   navigation/theme/branding are rendered (likely a later storefront iteration).
9. **Section add/update position semantics.** API-SPEC §26 shows `position` on add and a
   reorder endpoint. Implemented: insert-at-position shifts the following sections; PATCH
   `position` moves with re-densification; reorder requires a full permutation.
   → Product Owner: confirm shift-based semantics.

## 24. Deviations from FINAL documents

None. No table, model, enum, field, endpoint, role, lifecycle state, constraint or RLS
policy outside the FINAL documents was added. No migration or schema change was made. The
only interpretive choices are the Open Decisions above, each reported rather than silently
invented.

## 25. Git status

**MY CHANGES (Phase 12, uncommitted — no commit/push performed):**
- New: `apps/api/src/cms/**` (49 files), `apps/api/test/cms.e2e-spec.ts`,
  `apps/api/test/cms-database-tests.blocked.e2e-spec.ts`, `docs/IMPLEMENTATION-PHASE12-CMS.md`.
- Modified (additive): `apps/api/src/app.module.ts` (+2 lines: CmsModule import/registration).

**PRE-EXISTING CHANGES (untouched, preserved):** the entire Phase 1–11 uncommitted working
- tree (schema.prisma, migrations, all prior modules, all prior tests/reports, the modified
  FINAL docs, domain-model-diff.txt, etc.).

No destructive Git operations were performed (no `reset` / `restore` / `clean` /
`checkout`), no commits, no pushes.

Note: `npx prettier --check` on ALL of `src/**`/`test/**` reports 6 pre-existing warnings in
Phase 1–11 files (`src/identity/domain/store-slug.ts`, `src/identity/services/store.service.spec.ts`,
`src/tenant/tenant-context.guard.ts`, `test/identity-database-tests.blocked.e2e-spec.ts`,
`test/shipping-fulfillment-database-tests.blocked.e2e-spec.ts`, `test/shipping-fulfillment.e2e-spec.ts`)
which predate Phase 12 and were left untouched (git safety). Every Phase 12 file is
Prettier-clean.

## 26. Exact next phase

Per `docs/DEVELOPMENT-ROADMAP.md`, the next phase after CMS is **Media (roadmap
Phase 13)** — upload/delete images, product/CMS media, media metadata and storage
organization (Supabase Storage). SaaS Subscription (roadmap Phase 14) follows.

**STOP.** Media, SaaS Subscription and all later phases were NOT started. No speculative
code was added beyond the documented CMS phase.

PHASE 12 — CMS COMPLETE.
WAITING FOR EXPLICIT APPROVAL BEFORE THE NEXT PHASE.
