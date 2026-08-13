# Ziad E-commerce — Phase 1: Foundation Completion (Implementation Notes)

**Status:** Implemented & validated offline
**Scope:** Infrastructure only — no domain modules (Products, Inventory,
Customers, Orders, Payments, Checkout, CMS, Media, Subscription) were
implemented.

---

## 1. Purpose

Phase 1 establishes the backend infrastructure every future module depends on.
It does NOT change the FINAL Domain Model (`docs/DOMAIN-MODEL.md` v2.0) or the
FINAL Database (`docs/DATABASE.md` v2.0), and it does not introduce any new
tables or domain entities.

## 2. Architecture implemented

```
Request
  -> RequestContextMiddleware   (X-Request-ID + AsyncLocalStorage context)
  -> AuthGuard                  (Bearer token -> AuthProvider -> AuthenticatedUser)
  -> TenantContextGuard         (AuthenticatedUser -> ACTIVE membership -> Store)
  -> RolesGuard                 (@Roles('OWNER'|'ADMIN'|'STAFF'))
  -> Controller/Service
```

Modules added under `apps/api/src`:

| Path                                    | Responsibility                            |
| --------------------------------------- | ----------------------------------------- |
| `common/errors/`                        | Domain error taxonomy (codes + exceptions)|
| `common/context/`                       | Request context + correlation ID          |
| `common/decorators/public.decorator.ts` | `@Public()` marker for public routes      |
| `common/types/express.d.ts`             | `Request.requestId` type augmentation     |
| `infrastructure/database/`              | TransactionService + RlsTenantBinder      |
| `auth/`                                 | AuthProvider boundary, SupabaseAuthProvider, AuthGuard, `GET /auth/me` |
| `tenant/`                               | TenantContextService + TenantContextGuard |
| `authorization/`                        | `@Roles(...)` + RolesGuard                |

All new modules are `@Global()` and imported by `AppModule` in an explicit
order that guarantees guard execution order:

## 3. Request / tenant context

- `RequestContextService` is backed by Node `AsyncLocalStorage`. There is NO
  module-level mutable state and therefore no cross-request leakage (verified
  by unit tests).
- The context carries: `requestId`, `user` (authenticated), `membership`
  (resolved ACTIVE membership) and `store` (resolved Store).
- The tenant is resolved strictly as:
  `Authenticated User -> ACTIVE StoreMembership -> Store`.
  A client-supplied `store_id` (`X-Store-Id` header or `:storeId` route
  parameter) is used ONLY as a lookup key to select the membership; it is
  NEVER an authorization source. Missing/inactive memberships and cross-store
  requests fail closed.
- The context provides the hook consumed by future repositories/services:
  `RequestContextService.getCurrent()` exposes `user/membership/store`.

## 4. Transaction helper

- `TransactionService.run(work, options?)` — explicit Prisma interactive
  transaction boundary (DATABASE.md section 28).
- `TransactionService.runWithTenant(storeId, work, options?)` — binds the
  resolved Store ID to the database session via `app.set_current_store_id`
  and ALWAYS resets it in `finally`.
- `RlsTenantBinder` wraps the migration's `app.set_current_store_id(uuid)`.
  Because the migration writes the session GUC with `set_config(..., false)`
  (persists after the transaction), the binder resets the setting to empty so
  a pooled connection never returns to the pool carrying another tenant's
  context. This is a technical implementation detail; it does not alter the
  FINAL migration.
- External API calls must stay OUTSIDE these transactions (DATABASE.md §28.7).

## 5. Domain error taxonomy

- `DomainErrorCode` (NOT_FOUND, CONFLICT, FORBIDDEN, UNAUTHORIZED,
  VALIDATION_ERROR, BAD_REQUEST, STATE_TRANSITION, INSUFFICIENT_INVENTORY,
  IDEMPOTENCY_CONFLICT, TENANT_CONTEXT_REQUIRED).
- Typed exceptions in `domain-exceptions.ts` (NotFoundError, ConflictError, ...).
- `AllExceptionsFilter` renders DomainError with its explicit `code` inside the
  existing envelope `{ error: { code, message, details } }`. Internal errors
  still render `INTERNAL_SERVER_ERROR` and never leak stack traces/credentials.
- Log lines are enriched with the request ID.

RequestContext -> AuthGuard -> TenantContextGuard -> RolesGuard.

## 6. Request correlation / logging

- `RequestContextMiddleware` reads `X-Request-ID`, preserves it only when it
  is valid (length <= 128, `[A-Za-z0-9._~-]`), otherwise generates a UUID.
- The resolved ID is echoed in the `X-Request-ID` response header and made
  available to logs, guards, exceptions and future audit logging via the
  context.
- No tokens, secrets or credentials are ever logged.

## 7. Authentication status

- Boundary implemented: `AuthProvider` abstraction + `AuthGuard` (401 for
  missing/malformed/invalid/expired tokens).
- `SupabaseAuthProvider` verifies tokens against `{SUPABASE_URL}/auth/v1/user`
  using Node's built-in `fetch` — no new dependency, no local JWT parsing, no
  faked verification.
- **NOT operational**: `SUPABASE_URL` / `SUPABASE_ANON_KEY` are not set in this
  environment, so the provider fails closed (401) until configured. Unit tests
  exercise the boundary with mocks only. Do NOT claim Supabase integration
  works yet.

## 8. Authorization status

- Fixed minimum role boundary only: `OWNER | ADMIN | STAFF`.
- `@Roles('OWNER')` / `@Roles('OWNER', 'ADMIN')` + global `RolesGuard`.
- Roles come exclusively from the resolved ACTIVE membership; clients cannot
  supply roles.
- **Pending**: granular permissions (`products.create`, `orders.refund`, ...)
  are explicitly OUT of scope until `docs/AUTHORIZATION.md` is created. The
  absence of that document is an acknowledged dependency.


## 9. RLS integration status

- The RLS hook (`RlsTenantBinder` + `runWithTenant`) is implemented and
  unit-tested with mocks.
- **NOT verified**: real RLS behavior, concurrency behavior and migration
  execution require a live PostgreSQL instance and are marked
  **BLOCKED — PostgreSQL unavailable** (see
  `apps/api/test/database-tests.blocked.e2e-spec.ts`).

## 10. Security notes

- Client-supplied `store_id`, `user_id` and `role` are never trusted.
- All protected routes fail closed: missing auth -> 401, missing/inactive
  membership -> 403, ambiguous tenant -> 400 `TENANT_CONTEXT_REQUIRED`.
- Public routes are limited to `@Public()` endpoints (health; future
  storefront reads).
- Service-role/RLS-bypass paths are intentionally NOT wired to merchant
  requests (reserved for future server-only webhook infrastructure).

## 11. Testing

- Unit: 17 suites / 79 tests pass (no PostgreSQL required).
- E2E: 14 tests pass (foundation + existing scaffold); Supabase and PostgreSQL
  are stubbed.
- Blocked: 23 DB/RLS/concurrency/transaction tests defined but skipped,
  marked `BLOCKED — PostgreSQL unavailable`.

## 12. Decisions made (technical, no business-rule impact)

1. Tenant store selection uses `X-Store-Id` header (or `:storeId` route
   param) as a membership *lookup key* only.
2. ALL non-public routes require a resolved tenant context (fail closed).
   Platform-level (non-store) endpoints may need an explicit opt-out in a
   later phase.
3. The RLS binder resets the session GUC after tenant-scoped transactions.
4. Domain error codes use the exact names from the phase requirements
   (e.g. `NOT_FOUND`); the HTTP-status fallback mapping
   (`RESOURCE_NOT_FOUND`) is preserved for Nest built-ins so existing
   behavior is unchanged.

