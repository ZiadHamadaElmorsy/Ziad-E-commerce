# PHASE 13 — MEDIA FINAL REPORT

**Phase:** Media — roadmap **Phase 13** (docs/DEVELOPMENT-ROADMAP.md §16 "Phase 13 — Media").
**Status:** PASS (all offline-validatable scope complete; DB/RLS/PostgreSQL/Supabase-storage validations BLOCKED — see §19–§22).

---

## 1. Verdict

**PASS** — the merchant Media API is implemented end to end.

- All Media endpoints documented in `docs/API-SPEC.md` §29 are implemented:
  - `POST   /api/v1/media` — create a media upload (direct server upload; returns the required upload information/reference).
  - `GET    /api/v1/media/:mediaId` — media metadata + storage reference.
  - `DELETE /api/v1/media/:mediaId` — physical delete (metadata row + storage object).
- **No schema or migration change was made**: the FINAL Prisma schema and the initial
  migration already contain the `media` and `product_media` tables, the `media_type`
  enum, the `CHECK (size_bytes >= 0)` constraint, the composite store-scoped FK
  target `UNIQUE (store_id, id)`, the RESTRICT/SET NULL FK behaviors and the
  `tenant_isolation_*` + `public_storefront_select` RLS policy sets. Phase 13 only
  adds the application module + storage provider on top of that contract.
- Binary storage is behind a `StorageProvider` abstraction bound to a Supabase
  Storage implementation that FAILS CLOSED when credentials/bucket are missing
  (mirroring the Supabase Auth provider). No credentials were added anywhere.
- Tenant isolation is mandatory and store-scoped: every media query is scoped to
  the trusted tenant context (Authenticated User → ACTIVE StoreMembership →
  Store); every media write runs inside `TransactionService.runWithTenant`. A
  media id from another Store always fails closed (404/403, no existence leak).
- TypeScript, ESLint, Prettier (on all new files), `nest build`, `prisma validate`,
  `prisma generate`, **779 unit tests** and **263 E2E tests** pass (0 failures).
  **249 E2E tests are skipped** — every one is a blocked database test.
- PostgreSQL is **not available**, so all database/RLS/concurrency tests are
  `describe.skip` + `it.todo` (BLOCKED), following the established convention.
- Supabase is **not available**; no real Supabase Storage integration was performed
  (BLOCKED). Application logic and contract behavior are verified with an in-memory
  storage provider; the Supabase HTTP boundary is unit-tested with mocked `fetch`.

---

## 2. Source-of-truth documents inspected

| Document | Role |
|---|---|
| `docs/DEVELOPMENT-ROADMAP.md` | Phase 13 — Media (features: upload image, delete image, product media, CMS media, media metadata, storage organization `{store_id}/products\|categories\|cms\|branding`, security: Store A must never access Store B media) + phase numbering |
| `docs/API-SPEC.md` | §29 Media API (`POST /api/v1/media` returning the required upload information/reference; binary media in Supabase Storage; `GET /api/v1/media/:mediaId`; `DELETE /api/v1/media/:mediaId`), §33 security rules, §34 tenant isolation (Media listed), §35 resource ownership validation, §36 public vs protected |
| `docs/MVP-SCOPE.md` | §27 Media Management (product images, store logo, CMS images; storage provider Supabase Storage; media Store-scoped) |
| `docs/DOMAIN-MODEL.md` | §15.1 Media (purpose: stored media asset — product image, store logo, CMS image; ownership Store-scoped; storage Supabase Storage — DB stores metadata + references only; MVP supporting P1), §18 ownership (Media is Store-owned) |
| `docs/DATABASE.md` | §7.25 media table (id, store_id FK stores RESTRICT, storage_path, media_type IMAGE/VIDEO/FILE, mime_type, size_bytes CHECK >= 0, alt_text, created_at), §7.26 product_media (composite FKs, media FK RESTRICT, UNIQUE (product_id, media_id)), §9 FK inventory, §12 enums, §22 Media Data Model (storage, usage: product images / store logo / CMS images by media id/path, deletion), §25.1 retention (media deletable if unreferenced; product_media RESTRICT; logo SET NULL), §29 RLS |
| `docs/USER-STORIES.md` | US-MEDIA-001 (P0 upload: approved storage flow, Store association, unsupported files rejected, file size limits enforced, unauthorized users cannot access private Store media), US-MEDIA-002 (P1 delete: authorized media only, other-Store media cannot be deleted, references handled safely) |
| `docs/AI-AGENT-RULES.md` | §29 Media Rules (Store association, predictable tenant-prefixed storage paths, never allow one Store to manipulate another Store's media) |

Prior phase reports inspected: `docs/IMPLEMENTATION-PHASE12-CMS.md`, `...PHASE11-STOREFRONT.md`,
`...PHASE10-SHIPPING-FULFILLMENT.md`, `...PHASE9-PAYMENTS.md` (module conventions,
phase boundaries, "Media management itself is Phase 13" references).

---

## 3. Exact Media scope

**In scope (explicitly documented):**

- `POST /api/v1/media` — direct server upload; stores the binary in Supabase
  Storage and creates the `media` metadata row; returns the upload
  information/reference (API-SPEC §29).
- `GET /api/v1/media/:mediaId` — metadata + storage reference (API-SPEC §29).
- `DELETE /api/v1/media/:mediaId` — physical deletion of unreferenced media
  (metadata row + storage object) (API-SPEC §29, DATABASE §22.4/§25.1).
- Supabase Storage as the binary store with a server-side provider abstraction
  (DATABASE §7.25/§22.2; MVP-SCOPE §27).
- Media metadata persistence on the existing `media` table — reused exactly
  (DATABASE §7.25).
- Tenant isolation for all media operations (trusted context; RLS exists).
- Reference protection on delete: `product_media` RESTRICT → CONFLICT; theme logo
  SET NULL → allowed (DATABASE §22.4/§9.2).
- Media-type classification into the documented enum IMAGE / VIDEO / FILE
  (DATABASE §7.25/§12.2) — required because `media_type` is NOT NULL.

**Not implemented (not documented; explicitly excluded):**

- No media **listing** endpoint — API-SPEC §29 defines only POST/GET/DELETE.
- No `product_media` association endpoints — the roadmap lists "Product media"
  as a capability but API-SPEC defines no endpoint for it (OPEN DECISION 6).
- No presigned/signed URLs, no CDN, no image processing/resizing, no thumbnails.
- No MIME allowlist or maximum file size (nothing documented — OPEN DECISION 2).
- No cleanup/retention jobs, no audit entries for media (not in DATABASE §23.1).
- Phase 14 — SaaS Subscription, billing, plans, quotas: **not started**.


---

## 4. Files created

**Media module (`apps/api/src/media/`):**

| File | Purpose |
|---|---|
| `media.module.ts` | Nest module; binds `StorageProvider` → `SupabaseStorageProvider` |
| `media.types.ts` | Merchant `MediaView` + `toMediaView` (JSON-safe `sizeBytes`) |
| `controllers/media.controller.ts` | POST/GET/DELETE `/api/v1/media` (thin) |
| `services/media.service.ts` | Upload / get / delete business rules + validation |
| `repositories/media.repository.ts` | Store-scoped `media`/`product_media` persistence |
| `storage/storage-provider.ts` | `StorageProvider` abstraction (upload/delete) |
| `storage/supabase-storage-provider.ts` | Supabase Storage REST implementation (fail-closed) |
| `domain/media-type.ts` | MIME → IMAGE/VIDEO/FILE classification + normalization |
| `domain/media-storage-keys.ts` | `{store_id}/{media_id}` key builder + id generator |
| `domain/media-error.mapper.ts` | Prisma → domain error taxonomy (P2003/P2025) |
| `domain/read-raw-body.ts` | Raw binary request body reader |
| `dto/create-media-query.dto.ts` | `altText` upload query parameter validation |

**Tests:**

| File | Purpose |
|---|---|
| `controllers/media.controller.spec.ts` | Controller delegation + raw body forwarding |
| `services/media.service.spec.ts` | Upload flow, validation, get, delete, storage-failure handling |
| `repositories/media.repository.spec.ts` | Store-scoped queries, guarded delete, reference count |
| `storage/supabase-storage-provider.spec.ts` | Mocked-fetch upload/delete, fail-closed, 404 idempotent, URL encoding |
| `domain/media-type.spec.ts` | Classification rules |
| `domain/media-storage-keys.spec.ts` | Tenant-prefixed key generation |
| `domain/media-error.mapper.spec.ts` | Error mapping |
| `domain/read-raw-body.spec.ts` | Raw body reading / fail-closed JSON body |
| `test/media.e2e-spec.ts` | End-to-end Media API (17 tests) |
| `test/media-database-tests.blocked.e2e-spec.ts` | Blocked DB/RLS suite (14 `it.todo`) |

**Documentation:**

| File | Purpose |
|---|---|
| `docs/IMPLEMENTATION-PHASE13-MEDIA.md` | This report |

---

## 5. Files modified

| File | Change |
|---|---|
| `apps/api/src/app.module.ts` | Registered `MediaModule` (+2 lines) |
| `apps/api/src/common/errors/domain-error-code.enum.ts` | Added `STORAGE_ERROR` code (deliberate — see OPEN DECISION 7) |
| `apps/api/src/common/errors/domain-exceptions.ts` | Added `StorageError` (HTTP 502 BAD_GATEWAY) |
| `apps/api/src/common/errors/domain-exceptions.spec.ts` | Added the `StorageError` case to the taxonomy matrix |
| `apps/api/src/config/configuration.ts` | Added `storageBucket` to `SupabaseConfig` (`SUPABASE_STORAGE_BUCKET`) |
| `.env.example` (repo root) | Added `SUPABASE_STORAGE_BUCKET=media` |
| `apps/api/.env.example` | Added `SUPABASE_STORAGE_BUCKET=media` |

---

## 6. Files intentionally untouched

- `apps/api/prisma/schema.prisma` and `apps/api/prisma/migrations/**` — the FINAL
  schema already contains `media`/`product_media`/`media_type` and all constraints
  and RLS policies; no change was required.
- `apps/api/src/cms/**` (Phase 12) — not rewritten; the existing store-scoped
  `logoMediaId` reference validation is reused as-is.
- `apps/api/src/storefront/**` (Phase 11) — not redesigned; the public storefront
  already exposes product `images` as `{ id, altText }` only.
- `apps/api/src/auth/**`, `apps/api/src/tenant/**`, `apps/api/src/authorization/**`,
  `apps/api/src/infrastructure/**`, `apps/api/src/common/context/**` — reused as-is.
- All other Phase 1–12 modules, tests, FINAL documents and prior reports.

---

## 7. Architecture

```text
MediaController (thin)
   └─> MediaService (business rules)
         ├─> MediaRepository -> Prisma/PostgreSQL (media, product_media)
         └─> StorageProvider (abstraction)
               └─> SupabaseStorageProvider -> Supabase Storage REST API
   all writes inside TransactionService.runWithTenant(storeId, ...) (RLS-bound)
```

Global guard chain (unchanged): `AuthGuard` → `TenantContextGuard` → `RolesGuard`.
The tenant store id ALWAYS comes from the trusted context
(`requireStoreId` → Authenticated User → ACTIVE StoreMembership → Store); the
client-supplied `X-Store-Id` is only a membership lookup key, never an
authorization source.


---

## 8. Media data model

Reused exactly from the FINAL schema (`media`, DATABASE §7.25) — no columns added:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | server-generated UUID (also the storage key suffix) |
| `store_id` | uuid FK stores RESTRICT | tenant ownership |
| `storage_path` | text NOT NULL | Supabase Storage object key `{store_id}/{media_id}` |
| `media_type` | media_type NOT NULL | IMAGE / VIDEO / FILE (derived from Content-Type) |
| `mime_type` | text NULL | normalized Content-Type |
| `size_bytes` | bigint NULL | CHECK (size_bytes >= 0) — from the uploaded byte length |
| `alt_text` | text NULL | optional upload `altText` |
| `created_at` | timestamptz | immutable |

`product_media` (DATABASE §7.26) is not written by Phase 13 (no documented
endpoint — OPEN DECISION 6) but its RESTRICT FK protects media deletion.

---

## 9. Upload / storage flow

Direct server upload — the only flow the API-SPEC defines (no two-step
create/finalize endpoints and no status column on `media` to represent a pending
state):

1. Resolve the trusted store from the tenant context (never client input).
2. Validate: a classifiable `Content-Type` is required (the NOT NULL `media_type`
   must be derivable) and the body must be non-empty.
3. Derive `media_type` (image/* → IMAGE, video/* → VIDEO, else FILE) and normalize
   the MIME type.
4. Generate the media id (server-side UUID) and the tenant-scoped storage key
   `{store_id}/{media_id}`.
5. **Store the binary first** (`StorageProvider.uploadObject`) — no metadata row is
   created before the object exists, so a media row always references a stored
   object.
6. Create the metadata row inside `TransactionService.runWithTenant` (RLS sees the
   correct tenant).
7. Return the upload information/reference (the `MediaView`, including the storage
   path reference).

Storage provider: `SupabaseStorageProvider` calls
`POST/DELETE {SUPABASE_URL}/storage/v1/object/{bucket}/{key}` with the
service-role key. It FAILS CLOSED with `StorageError` when
`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_STORAGE_BUCKET` are
missing; credentials are server-side only and never logged.

Consistency: a DB write failure after a successful storage upload leaves an
orphaned object (no automatic rollback of external storage — DATABASE §28.7).
This window is documented (OPEN DECISION 5).

---

## 10. Media API endpoints

| Method | Path | Auth | Success | Errors |
|---|---|---|---|---|
| POST | `/api/v1/media` | Bearer + tenant | 201 `{ data: MediaView }` | 400 VALIDATION_ERROR (missing/empty body, missing Content-Type, bad altText), 400 TENANT_CONTEXT_REQUIRED, 502 STORAGE_ERROR |
| GET | `/api/v1/media/:mediaId` | Bearer + tenant | 200 `{ data: MediaView }` | 404 NOT_FOUND (absent/cross-tenant), 400 TENANT_CONTEXT_REQUIRED |
| DELETE | `/api/v1/media/:mediaId` | Bearer + tenant | 204 no content | 404 NOT_FOUND (absent/cross-tenant), 409 CONFLICT (product-referenced), 502 STORAGE_ERROR (pre-commit), 400 TENANT_CONTEXT_REQUIRED |

No endpoint outside the documented set was added (no listing endpoint).

---

## 11. Validation

- Only documented/schema-driven rules are enforced:
  - A classifiable `Content-Type` is required — `media_type` is NOT NULL and is
    derived from the MIME type (DATABASE §7.25/§12.2).
  - The uploaded body must be non-empty (a 0-byte object has no size that can be
    stored meaningfully; `size_bytes` would be 0, which the CHECK allows, but the
    asset is rejected as an empty upload — implementation decision).
  - `altText` optional, bounded to 1000 chars (implementation decision).
  - `size_bytes` CHECK (>= 0) is guaranteed by construction (byte length).
- **No maximum file size and no MIME/extension allowlist are enforced** because no
  FINAL document defines them. US-MEDIA-001 requires "unsupported files rejected"
  and "file size limits enforced" but defines neither the list nor the limits —
  recorded as OPEN DECISION 2. The server currently accepts any non-empty binary
  with a classifiable Content-Type (unbounded size), which is a deployment-level
  concern until approved.


---

## 12. Lifecycle

The `media` table has **no lifecycle/status column** (DATABASE §7.25). A media row
is created final (upload completed) and removed physically. No status transitions
were invented.

---

## 13. Deletion behavior

Physical deletion of **unreferenced** media (DATABASE §22.4/§25.1: "Media without
references may be deleted (metadata row + storage object)").

Flow (`DELETE /api/v1/media/:mediaId`):

1. Store-scoped lookup — NOT_FOUND for absent or cross-tenant ids (no existence
   leak).
2. Inside `TransactionService.runWithTenant`:
   - Count `product_media` references → **CONFLICT** when > 0 (RESTRICT-guarded;
     the DB FK is the final backstop, mapped from P2003).
   - Guarded `deleteMany` on `media WHERE id AND store_id` → NOT_FOUND when 0 rows.
3. **DB row deleted first**, then best-effort storage object deletion. The theme
   logo reference is cleared automatically by the DB FK
   `theme_configurations.logo_media_id ... ON DELETE SET NULL` (verified
   end-to-end in the e2e suite).

Reference semantics: media referenced by `product_media` **cannot** be deleted
(RESTRICT → 409). Media referenced only by the store logo **can** be deleted
(logo SET NULL). Historical media of archived products is retained automatically
because the archived product keeps its `product_media` links (RESTRICT).

Consistency limitation (documented, not hidden): if the storage object deletion
fails *after* the DB delete was committed, the metadata row is already gone and an
orphaned object remains in storage; the failure is logged server-side and the
request succeeds (a media row never points at a missing object). No cleanup job is
documented in the MVP, so none was implemented (OPEN DECISION 5).


---

## 14. CMS integration

- **Theme / Store branding** (`theme_configurations.logo_media_id`, DATABASE
  §7.24/§22.3): Phase 12 already validates the logo reference store-scoped and
  fails closed when the media row does not exist in the current store — reused
  unchanged. Phase 13 provides the media rows those references point at, and the
  e2e suite verifies the full loop: upload → PUT `/theme` with the new media id →
  DELETE media → logo cleared (SET NULL).
- **CMS images** (DATABASE §22.3: referenced from `page_sections` content JSONB by
  media id/path): the section `content` is an opaque JSON object (Phase 12, DATABASE
  §33 #11). No media-reference validation inside the JSONB is documented, so none
  was added (OPEN DECISION 8).
- Phase 12 CMS module code was **not rewritten**.

---

## 15. Storefront integration

The public Storefront (Phase 11) consumes media through `product_media` and
renders product `images` as `{ id, altText }` — explicitly no storage internals
(API-SPEC §32, "Internal fields must never leak to the public Storefront API").
No storefront change was required or made. Media binaries remain Store-scoped
(RLS + Supabase Storage policies, DATABASE §22.2); no public media download
endpoint was added because API-SPEC §31 does not define one.

---

## 16. Tenant isolation

- `storeId` ALWAYS comes from the trusted tenant context
  (Authenticated User → ACTIVE StoreMembership → Store); the client-supplied
  `X-Store-Id` is a membership lookup key only.
- Every repository operation is store-scoped (`findFirst WHERE id + storeId`,
  `deleteMany WHERE id + storeId`, `productMedia.count WHERE storeId + mediaId`).
- Every media write runs inside `TransactionService.runWithTenant` (RLS session
  binding) — the RLS policies already shipped by the initial migration are the
  final defense boundary (blocked DB suite).
- Cross-tenant access fails closed: a media id from another Store resolves to
  NOT_FOUND (404) — no existence leak. Selecting a store without membership
  resolves to FORBIDDEN (403).
- Storage object keys are tenant-prefixed (`{store_id}/{media_id}`), so a Store
  can never address another Store's objects (AI-AGENT-RULES §29).

---

## 17. Authorization

- Guard chain: `AuthGuard` (401 for missing/invalid tokens) →
  `TenantContextGuard` (membership resolution) → `RolesGuard` (active, unchanged).
- **No Media-specific role restriction is documented** in the FINAL sources
  (API-SPEC §29 defines no roles), so **no `@Roles()` restriction was invented**.
  The established boundary applies: any authenticated user with an ACTIVE
  StoreMembership (OWNER/ADMIN/STAFF) may manage that Store's media — matching
  every other merchant module.
- Storage credentials are server-side only; the API never exposes credentials,
  internal storage URLs, Prisma internals or stack traces (AllExceptionsFilter +
  StorageError).

---

## 18. Transactions / consistency

- Every media write (create row, guarded delete) runs inside one
  `TransactionService.runWithTenant` — the DB transaction is the consistency
  boundary for DB state.
- External storage operations are NOT inside the DB transaction (DATABASE §28.7):
  - Upload: object first, then DB row. A DB failure leaves an orphaned object
    (documented).
  - Delete: DB row first (guarded + reference-protected), then best-effort object
    cleanup. A cleanup failure leaves an orphaned object (logged, documented).
- No retry behavior is documented; none was implemented.


---

## 19. Tests executed

**All executed and passing (offline):**

| Gate | Result |
|---|---|
| `tsc --noEmit` (apps/api) | PASS |
| ESLint (`src/**` + `test/**`) | PASS |
| Prettier (all new Phase 13 files + modified files) | PASS (the 6 pre-existing Phase 1–11 warnings are untouched) |
| `nest build` | PASS |
| `prisma validate` | PASS |
| `prisma generate` | PASS |
| Unit tests (`jest`) | **779 passed / 0 failed** (110 suites; Phase 12 baseline 730 → +49 Media tests in 8 suites) |
| E2E tests (`jest --config test/jest-e2e.json --runInBand`) | **263 passed / 0 failed**, 249 skipped (all blocked DB suites); 14 suites passed, 13 skipped. Phase 12 baseline 246 → +17 Media e2e tests |

**Media unit coverage (49 tests / 8 suites):** media-type classification,
normalization, storage-key generation, raw-body reading (incl. fail-closed JSON
body), Prisma error mapping, repository store-scoping, Supabase provider
upload/delete/fail-closed/404-idempotent/URL-encoding, service upload flow
(order: storage before DB row), validation errors, storage failure propagation,
get/delete flows, reference CONFLICT, guarded-delete NOT_FOUND, post-commit
cleanup failure (non-fatal), missing tenant context.

**Media e2e coverage (17 tests):** 401 on every route; 403 cross-store header;
image/video/file classification on real HTTP uploads; storage reference
`{store_id}/{id}` returned and object actually stored; metadata retrieval;
404 unknown/cross-tenant; JSON body rejected; empty body rejected; oversized
altText rejected; unknown query param rejected; physical delete of unreferenced
media (row + object); product-referenced media refused (409); cross-tenant delete
404; delete of already-deleted media 404; theme logo reference loop with SET NULL
on media delete.

## 20. Tests blocked

- All `*-database-tests.blocked.e2e-spec.ts` suites (including the new
  `media-database-tests.blocked.e2e-spec.ts` with 14 `it.todo`): **BLOCKED —
  PostgreSQL unavailable.** No DB-level guarantee (RLS isolation, composite FK
  rejection, RESTRICT/SET NULL, CHECK, enum, concurrency) is claimed.
- Real Supabase Storage integration tests: **BLOCKED — credentials unavailable.**
- No test faked a successful real-cloud operation.

## 21. PostgreSQL / RLS status

**BLOCKED.** No `.env` / `DATABASE_URL` exists in this environment and no
PostgreSQL server is reachable. The initial migration already ships the media RLS
policies (`tenant_isolation_*` for `authenticated`, `public_storefront_select` for
`anon`) — their enforcement is covered by the blocked suite, not by the passing
offline tests. `prisma validate` / `prisma generate` were run with a placeholder
`DATABASE_URL` (as the repository scripts do); no live database was contacted.

## 22. Storage integration status

**BLOCKED — real Supabase Storage not validated.** No `SUPABASE_URL` /
`SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_STORAGE_BUCKET` credentials exist here.
What WAS validated:
- The `StorageProvider` contract and the full upload→store→reference→delete flow
  via an **in-memory storage provider** in the e2e suite (PASS).
- The Supabase HTTP boundary (`POST/DELETE /storage/v1/object/...`, auth header,
  fail-closed on missing config, 404-idempotent delete, per-segment URL encoding)
  via **mocked `fetch`** in unit tests (PASS).
- No claim of real cloud storage validation is made.

## 23. Supabase status

**BLOCKED / not applicable to any live call.** Supabase is not available and was
not contacted. No credentials were added anywhere. The storage provider FAILS
CLOSED when Supabase configuration is missing (mirroring the Auth provider), so
the API remains safe (502 STORAGE_ERROR) until a project is configured.


---

## 24. Open decisions

Each ambiguity was resolved with the smallest non-inventive choice and is reported
here rather than silently guessed. Items marked **PO approval** require a Product
Owner decision.

1. **Upload request format.** API-SPEC §29 does not define the upload request
   format. Implemented: direct server upload with the **raw binary body**, the
   standard `Content-Type` header (MIME + media classification), and the optional
   `altText` **query parameter**. No multipart was chosen because it would require
   new dependencies (`multer`/`@types/multer` are not declared in the project).
   → PO approval: confirm the raw-binary contract for the admin frontend.
2. **File validation limits.** US-MEDIA-001 requires rejecting unsupported files
   and enforcing size limits, but no FINAL document defines the allowed MIME list,
   allowed extensions, or the maximum size. Implemented: only schema-driven rules
   (non-empty body, classifiable Content-Type, `size_bytes >= 0`); **no arbitrary
   size cap or MIME allowlist**. Unbounded body size is a deployment-level concern
   until approved. → PO approval required.
3. **Storage subfolder for generic uploads.** The roadmap documents the storage
   organization `{store_id}/products|categories|cms|branding`. A generic
   `POST /media` asset is not yet attached to any purpose, so the implemented key
   is `{store_id}/{media_id}` (mandatory store prefix preserved; unique,
   predictable). Purpose-specific subfolders can be introduced by future flows.
   → PO approval: confirm the generic key layout.
4. **`storagePath` in the merchant response.** The merchant `MediaView` exposes the
   documented `storage_path` reference ("The backend should return the required
   upload information/reference"). This is the protected merchant contract; the
   public storefront API still never exposes storage internals.
   → PO approval: confirm exposing the object key to the admin client.

5. **Delete ordering / orphaned objects.** Order = DB metadata first, then
   best-effort storage cleanup; a post-commit cleanup failure is logged and does
   not fail the request (a media row never points at a missing object). If the
   storage upload succeeds but the DB row fails (or cleanup fails after delete),
   an orphaned object remains; **no cleanup job was implemented** (none documented).
   → PO approval: confirm ordering and the orphan limitation.
6. **No `product_media` management endpoint.** The roadmap lists "Product media"
   but API-SPEC §29 defines no endpoint to attach media to products. Phase 13
   therefore implements only the documented media endpoints; `product_media` rows
   are read by the storefront and protect deletion via RESTRICT.
   → PO approval: define the product-media attach endpoint (likely a Catalog-phase
   follow-up or an explicit Media contract extension).
7. **`STORAGE_ERROR` domain code.** Added to the shared taxonomy (HTTP 502) so
   storage failures surface as a stable, typed code instead of a generic internal
   error. This is a deliberate, documented addition to the "small and reusable"
   code list. → no PO approval needed (error-contract quality).
8. **CMS image references in section content.** DATABASE §22.3 describes CMS images
   referenced from `page_sections` content JSONB by media id/path, but no per-type
   content schema or reference validation is documented (DATABASE §33 #11). No
   validation was added inside the opaque JSONB. → PO approval: confirm whether
   media-reference validation inside section content is required.
9. **Supabase Storage bucket name.** Introduced as `SUPABASE_STORAGE_BUCKET`
   (default `media` in `.env.example`); the provider fails closed when missing.
   Bucket naming is infrastructure configuration, not business behavior.
   → no PO approval needed.
10. **`altText` length bound.** Bounded to 1000 characters (implementation
    decision; the column is unbounded TEXT). → no PO approval needed.
11. **Delete of 404 storage object treated as success.** The provider treats an
    already-absent object during delete as success (idempotent-safe; consistent
    with the metadata-removal contract). → no PO approval needed.


---

## 25. Deviations from FINAL documents

None. No table, model, column, enum, endpoint, role, lifecycle state, constraint
or RLS policy outside the FINAL documents was added, and no schema or migration
change was made. The only deliberate shared-contract additions are the
`STORAGE_ERROR` domain code and the `SUPABASE_STORAGE_BUCKET` config value; every
other interpretive choice is reported as an Open Decision above.

## 26. Git status

**MY CHANGES (Phase 13, uncommitted — no commit/push performed):**
- New: `apps/api/src/media/**` (20 files), `apps/api/test/media.e2e-spec.ts`,
  `apps/api/test/media-database-tests.blocked.e2e-spec.ts`,
  `docs/IMPLEMENTATION-PHASE13-MEDIA.md`.
- Modified (additive): `apps/api/src/app.module.ts` (+2 lines),
  `apps/api/src/common/errors/domain-error-code.enum.ts`,
  `apps/api/src/common/errors/domain-exceptions.ts`,
  `apps/api/src/common/errors/domain-exceptions.spec.ts`,
  `apps/api/src/config/configuration.ts`, `.env.example`, `apps/api/.env.example`.

**PRE-EXISTING CHANGES (untouched, preserved):** the entire Phase 1–12 uncommitted
working tree (schema.prisma, migrations, all prior modules, tests, reports, the
modified FINAL docs, domain-model-diff.txt, etc.).

No destructive Git operations were performed (no `reset` / `restore` / `clean` /
`checkout`), no commits, no pushes. `schema.prisma` and all migrations were not
modified.

## 27. Exact next phase

Per `docs/DEVELOPMENT-ROADMAP.md`, the next phase after Media is **SaaS
Subscription (roadmap Phase 14)** — free trial, subscription plans, monthly
subscription, status/expiry, access control. **STOP.** Phase 14 and all later
phases were NOT started; no speculative code was added beyond the documented Media
phase.

PHASE 13 — MEDIA COMPLETE.
WAITING FOR EXPLICIT APPROVAL BEFORE THE NEXT PHASE.

