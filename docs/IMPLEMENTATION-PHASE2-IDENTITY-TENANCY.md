# Ziad E-commerce — Phase 2: Identity & Tenancy (Implementation Notes)

**Status:** Implemented & validated offline
**Scope:** User / Store / StoreMembership only. No Subscription, Catalog,
Inventory, Customer, Cart, Order, Payment, Checkout, CMS, Media or Audit
modules were implemented.

---

## 1. Purpose

Phase 2 establishes the first real merchant/tenant lifecycle on top of the
FINAL database contract (`prisma/schema.prisma` + the initial migration) and
the Phase 1 foundation:

```text
Authenticated User
    ↓
Store Membership
    ↓
Store
    ↓
Tenant Context
    ↓
Role Boundary
```

It does NOT change `docs/DOMAIN-MODEL.md` (v2.0 FINAL), `docs/DATABASE.md`
(v2.0 FINAL), the Prisma schema or the migration. No tables or fields were
added.

## 2. Implemented components

```
apps/api/src/common/decorators/skip-tenant-context.decorator.ts   @SkipTenantContext()
apps/api/src/identity/
  identity.module.ts
  identity.types.ts                          StoreView (public representation)
  controllers/stores.controller.ts           POST/GET/PATCH stores endpoints
  dto/create-store.dto.ts                    API-SPEC §15 request shape
  dto/update-store.dto.ts                    API-SPEC §15 request shape (name only)
  domain/store-slug.ts                       slug normalization + validation
  services/store.service.ts                  Store lifecycle (atomic create, read, update)
  services/membership.service.ts             resolveMembership(userId, storeId)
  repositories/user.repository.ts            findByAuthUserId / findById
  repositories/store.repository.ts           create / findById / findBySlug / update
  repositories/store-membership.repository.ts create / findActiveMembership / ...
```

Modified Phase 1 files (minimal, additive):

- `apps/api/src/tenant/tenant-context.guard.ts` — honors the new
  `@SkipTenantContext()` marker (authenticated routes that skip tenant
  resolution; store creation is the first consumer). Phase 1 explicitly
  anticipated this: "Platform-level (non-store) endpoints may need an explicit
  opt-out in a later phase."
- `apps/api/src/app.module.ts` — imports `IdentityModule`.
- `apps/api/src/tenant/tenant-context.guard.spec.ts` — two new tests covering
  the skip behavior.

## 3. Endpoints

| Method | Path                    | Auth | Tenant | Notes |
| ------ | ----------------------- | ---- | ------ | ----- |
| POST   | /api/v1/stores          | ✅   | ⏭ skipped | 201; atomic Store + ACTIVE OWNER membership |
| GET    | /api/v1/stores/current  | ✅   | ✅ resolved from context | 200 store |
| PATCH  | /api/v1/stores/current  | ✅   | ✅ resolved from context | 200 updated store (name only) |
| GET    | /api/v1/auth/me         | ✅   | ✅ (existing) | preserved unchanged |

Response convention follows API-SPEC §7: `{ "data": { ... } }`. Errors follow
the envelope `{ "error": { "code", "message", "details" } }` through the
existing `AllExceptionsFilter`.

## 4. Domain rules enforced

1. Identity always comes from the authentication boundary (Bearer token ->
   `AuthenticatedUser.authUserId`), never from the client.
2. Client-supplied `store_id`, `user_id` or `role` are NEVER authorization
   sources. A client-supplied store id is at most a membership *lookup key*
   (Phase 1 `TenantContextService`).
3. Store access requires an ACTIVE `StoreMembership` (fail closed: no
   membership -> 403 FORBIDDEN; inactive -> 403; ambiguous multi-store ->
   400 TENANT_CONTEXT_REQUIRED).
4. Membership role is resolved from the database (`store_memberships.role`):
   OWNER | ADMIN | STAFF.
5. Store creation is atomic: Store + exactly one ACTIVE OWNER membership in a
   single transaction (`TransactionService.run`). Any failure rolls back.
6. At most one OWNER per store (DB partial unique index
   `uq_store_memberships_single_owner`; no application-level write path
   creates a second one).
7. Store slug is globally unique (`stores.slug` UNIQUE). Conflicts surface as
   409 CONFLICT via the domain error taxonomy (P2002 mapped; Prisma internals
   never leak).
8. Store lifecycle respects the finalized `StoreStatus` (ACTIVE/DISABLED/
   SUSPENDED). Store creation always produces ACTIVE. `status` is NOT mutable
   through this endpoint (not listed in API-SPEC §15 PATCH).
9. Membership lifecycle respects `MembershipStatus` (ACTIVE/INACTIVE). Store
   creation always produces ACTIVE; only ACTIVE memberships resolve.
10. Cross-store access fails closed (403).

## 5. Tenant resolution

Unchanged central mechanism: `TenantContextService.resolveForUser(authUserId,
candidateStoreId?)` — `Authenticated User -> ACTIVE membership -> Store`. No
second tenant-resolution mechanism was introduced.

The ONLY exception is `POST /api/v1/stores`, which is `@SkipTenantContext()`
because a merchant creating their first store has no membership yet
(authentication still applies and fails closed with 401 when absent).

## 6. Authorization boundary

- No Phase 2 endpoint declares `@Roles(...)`: no source document defines a
  role restriction for store creation / current-store read / current-store
  update, so none was invented. The fixed OWNER/ADMIN/STAFF boundary remains
  enforced by the existing `RolesGuard` for future endpoints that declare
  roles.
- A client cannot supply a role: the POST/PATCH DTOs contain no role field,
  and the global ValidationPipe (`forbidNonWhitelisted`) rejects it with 400
  VALIDATION_ERROR.

## 7. Membership resolution

`MembershipService.resolveMembership(userId, storeId)` (identity module,
exported) returns the ACTIVE membership and its role:

- No membership -> FORBIDDEN
- Inactive membership -> FORBIDDEN (only ACTIVE rows can resolve)
- Valid ACTIVE membership -> returned with its role

The ambiguous "multiple stores, none selected" case is owned by the existing
request-level `TenantContextService` (already implemented) and is not
duplicated here, because `resolveMembership` is always given an explicit
storeId.

## 8. Transaction behavior

- Store creation: `TransactionService.run` wraps (Store create -> OWNER
  membership create). Rollback on any failure.
- Current-store update: `TransactionService.runWithTenant(storeId, ...)` binds
  the resolved tenant id for the write (RLS defense-in-depth) and resets it in
  `finally` (existing `RlsTenantBinder`).
- Prisma errors are mapped to the domain taxonomy: P2002 -> CONFLICT,
  P2025 -> NOT_FOUND; everything else rethrows untouched (rendered as generic
  INTERNAL_SERVER_ERROR by the filter).

## 9. Validation

Global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) +
`class-validator`/`class-transformer` DTOs. Slug character/length rules live in
the domain layer (`identity/domain/store-slug.ts`).

## 10. Testing

Unit (jest, no DB): 24 suites / 127 tests pass, including:

- User resolution (authenticated identity -> application user; unknown
  identity -> NOT_FOUND; lookup behavior)
- Store create (atomic create + OWNER ACTIVE membership, rollback boundary,
  slug conflict -> CONFLICT, invalid slug, unauthorized)
- Current store (read + update from trusted context, TENANT_CONTEXT_REQUIRED,
  NOT_FOUND, cross-tenant prevention)
- Membership (ACTIVE resolves with role, inactive/missing rejected, role
  derived from DB)
- Authorization (roles only from DB membership; client role rejected;
  guard-level OWNER/ADMIN/STAFF coverage from Phase 1 retained)
- Repositories (Prisma access shapes)

E2E (jest e2e, real guard chain + real TenantContextService, stubbed
Prisma/AuthProvider): `apps/api/test/identity.e2e-spec.ts` — 29 e2e tests pass
(identity + foundation + scaffold). Verified: 401/403/404/409/400 error paths,
atomic writes inside one transaction, cross-store prevention, X-Store-Id
ignored on the tenant-skipped route, unsupported PATCH fields rejected,
`GET /auth/me` preserved.

Lint (`eslint`), typecheck (`tsc --noEmit`) and build (`nest build`) all pass.

## 11. Blocked tests

`apps/api/test/identity-database-tests.blocked.e2e-spec.ts` (describe.skip,
visible + clearly marked):

- real transaction rollback of Store + OWNER membership creation
- stores.slug global UNIQUE enforcement on a live DB
- partial UNIQUE (store_id) WHERE role = OWNER (single owner)
- UNIQUE (store_id, user_id) membership rule
- RLS policies for users / stores / store_memberships (§29.5)
- tenant isolation of identity tables

Status: **BLOCKED — PostgreSQL unavailable.** These scenarios are NOT covered
by any passing test. They must be enabled (remove `.skip`) and run once a live
PostgreSQL instance is available, together with the Phase 1 blocked DB suite.

## 12. Supabase status

Unchanged: `AuthProvider` abstraction remains; `SupabaseAuthProvider` fails
closed because `SUPABASE_URL` / `SUPABASE_ANON_KEY` are not configured. Live
Supabase verification is **BLOCKED**; e2e tests mock the provider. No
credentials were added or hard-coded.

## 13. Unresolved dependencies / open decisions

1. **Application `users` row provisioning (dependency).** The auth boundary
   yields only `authUserId` + `email`. The FINAL `users` table requires
   `first_name`, `last_name`, `email` (NOT NULL), and `UserRepository` is
   intentionally limited to `findByAuthUserId` / `findById` (per the phase
   brief). No source document defines where the application `users` row is
   created (registration goes through Supabase Auth). Consequence: store
   creation requires an existing application User row and fails with 404
   NOT_FOUND otherwise. **A Product Owner decision is required** on user
   provisioning (e.g. a Supabase Auth webhook/trigger or a documented
   registration step) before live merchant onboarding can succeed.
2. **PATCH /stores/current fields (API-SPEC vs FINAL DATABASE).** API-SPEC
   (Draft) lists `logoMediaId`, `contactEmail`, `contactPhone` as possible
   fields. None has a home in the FINAL `stores` table: `logoMediaId` belongs
   to `theme_configurations` (future CMS/Media), and `contactEmail` /
   `contactPhone` are absent from DATABASE.md. Only `name` is implemented;
   the others are rejected with 400 VALIDATION_ERROR. **A Product Owner
   decision is required** (add columns via a finalized schema change, map to
   `store_settings`, or defer to the CMS/Media phase).
3. **Slug charset.** The documents require a globally unique, URL-safe slug
   but define no explicit charset. `identity/domain/store-slug.ts` uses the
   minimal URL-safe rule `[a-z0-9]` + hyphens, ≤ 63 chars, no leading/trailing
   hyphen. Technical validation; flagged for confirmation.
4. **Store status mutation.** MVP-SCOPE lists "Configure Store status", but
   API-SPEC §15 PATCH does not include `status`. Not implemented; store status
   lifecycle requires a documented endpoint/decision.
5. **Role restrictions.** No Phase 2 endpoint declares `@Roles(...)` because
   no source document defines a restriction. If OWNER-only (or similar)
   restrictions are intended, they require a Product Owner decision.

## 14. Deviations from source documents

None of the FINAL documents (`DOMAIN-MODEL.md`, `DATABASE.md`, `MVP-SCOPE.md`,
`DEVELOPMENT-ROADMAP.md`) were modified. `API-SPEC.md` was not modified either.
The only Phase 1 code change is the additive `@SkipTenantContext()` opt-out in
`TenantContextGuard`, which Phase 1's own notes anticipated. The API-SPEC-vs-
DATABASE contradictions above are reported, not silently resolved.

## 15. Next phase

WAIT for explicit approval. The next phase (per docs/DEVELOPMENT-ROADMAP.md
after Multi-Tenancy & Store) is Catalog (Products / Variants / Categories).
Phase 2 does not start it automatically.


