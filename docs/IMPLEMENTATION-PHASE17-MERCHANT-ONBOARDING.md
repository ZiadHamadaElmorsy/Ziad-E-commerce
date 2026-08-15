# Phase 17 — Merchant Onboarding (Implementation Report)

Status: **IMPLEMENTED**

This phase connects the public marketing website to the existing backend,
identity, tenancy, subscription, and dashboard flow:

```text
Public Marketing Website → /signup → Supabase Auth account →
Email confirmation (if required) → /onboarding → Store/Tenant creation →
StoreMembership (OWNER) → TRIAL subscription → Dashboard
```

No new architecture was introduced. The implementation reuses the existing
`identity` module (Store, StoreMembership, User), the tenant context, the
transaction helper, the subscription module, the catalog/theme APIs and the
existing dashboard.

## 1. What already existed

- Supabase Auth guard (`AuthGuard`) + `SupabaseAuthProvider.verifyToken`.
- Tenant guard: `Authenticated User -> ACTIVE StoreMembership -> Store`.
- `POST /api/v1/stores` (atomic Store + OWNER membership + TRIAL subscription),
  but it **404'd** when the authenticated Supabase user had no application
  `users` row — application-user provisioning was the documented open
  dependency.
- Frontend `/signup` created only the Supabase account and pointed at
  `/dashboard`, where a user without a membership was treated as logged out.

## 2. Backend changes (apps/api)

New/changed files:

| File | Change |
| --- | --- |
| `src/identity/dto/create-merchant.dto.ts` | New. `POST /onboarding/merchant` body: `firstName`, `lastName`, `storeName`, optional `slug`/`currency`. No password field. |
| `src/identity/domain/store-slug.ts` | Added `generateStoreSlug(name)` (name → URL-safe slug candidate). |
| `src/identity/repositories/user.repository.ts` | Added `create(tx, data)` (idempotent provisioning). |
| `src/identity/repositories/store-membership.repository.ts` | Added `findActiveMembershipsForUserTx`. |
| `src/identity/repositories/store.repository.ts` | Added `findByIdTx`. |
| `src/identity/services/onboarding.service.ts` | New. Idempotent, atomic `createMerchant` + `getStatus`. |
| `src/identity/controllers/onboarding.controller.ts` | New. `POST /onboarding/merchant`, `GET /onboarding/status`. Both `@SkipTenantContext()` (no membership exists yet) and authenticated. |
| `src/identity/identity.module.ts` | Registered the controller + service. |
| `src/identity/services/onboarding.service.spec.ts` | New unit tests (13). |
| `src/identity/domain/store-slug.spec.ts` | Added `generateStoreSlug` tests. |
| `test/onboarding.e2e-spec.ts` | New e2e suite (12 tests, stubbed Prisma). |

### Endpoints

- `POST /api/v1/onboarding/merchant` (authenticated, `@SkipTenantContext`)
  Creates, in a single `TransactionService.run` boundary:
  1. the application `User` row (if absent — idempotent on `users.auth_user_id`),
  2. the `Store` (the tenant boundary; slug validated/generated),
  3. the ACTIVE `OWNER` `StoreMembership`,
  4. the TRIAL `Subscription` (existing `SubscriptionService.startTrial`).

  Retries return the existing Store (no duplicate User/Store/membership).
  Slug conflicts surface as `409 CONFLICT`; Prisma internals never reach the
  client. Role is hardcoded `OWNER` server-side (client input never trusted).
- `GET /api/v1/onboarding/status` (authenticated, `@SkipTenantContext`)
  Returns `{ user, store, membership }` for the current identity — used by the
  frontend to route between onboarding and the dashboard when `/auth/me`
  cannot resolve a tenant yet.

### Transaction / consistency

User → Store → membership → trial are created in ONE interactive transaction.
Any failure rolls everything back. Idempotency is enforced twice: a fast-path
pre-check outside the transaction and a re-check inside the boundary; unique
constraint races are resolved (concurrent user creation → re-read → return
existing store).

### Security

- Store id is never accepted from the client.
- Role is never accepted from the client.
- Tenant context is only ever resolved from membership (existing guards).
- Both endpoints are authenticated through the existing Supabase guard.
- Tenant isolation verified by new e2e tests (Merchant B cannot read
  A's store, create products, or list A's orders/customers).


## 3. Frontend changes (apps/web)

| File | Change |
| --- | --- |
| `lib/api/types.ts` | Added `OnboardingStatus`, `CreateMerchantInput`, `CreateMerchantResult`, `StoreViewFull`, `ThemeView`, `UpdateThemeInput`. |
| `lib/api/onboarding.ts` | New API service (`createMerchant`, `getStatus`). |
| `lib/api/theme.ts` | New API service (`getTheme`, `updateTheme`). |
| `lib/api/client.ts` | Added `put` method (theme endpoint). |
| `lib/auth/auth-context.tsx` | `/auth/me` `403 FORBIDDEN` / `400 TENANT_CONTEXT_REQUIRED` now fall back to `GET /onboarding/status`: resolves the store when one exists, otherwise marks the user "authenticated without a store" (instead of logging them out). |
| `app/signup/page.tsx` | Collects first/last name + store name + email/password. `signUp` stores names in Supabase user metadata (survives email confirmation). Routes to `/onboarding` when a session is returned. |
| `app/onboarding/page.tsx` | New. Gate: loading → spinner; unauthenticated → `/login`; already-onboarded → `/dashboard`; otherwise the 4-step flow. |
| `components/onboarding/StoreInfoStep.tsx` | Step 1 — creates the merchant via the idempotent onboarding API (name prefilled from session metadata, store name/slug from signup). |
| `components/onboarding/AppearanceStep.tsx` | Step 2 — theme `primaryColor`/`fontFamily` via the existing Theme API. |
| `components/onboarding/FirstProductStep.tsx` | Step 3 — optional first product via the existing Catalog API (product + default-variant price). |
| `components/onboarding/LaunchStep.tsx` | Step 4 — launch checklist (store created ✓, info ✓, first product / storefront / publish links) + dashboard CTA. |
| `components/dashboard/DashboardGate.tsx` | Authenticated merchants without a Store are redirected to `/onboarding`. |
| `lib/utils.ts` | Added `slugifyStoreName` + `poundsToPiastres`. |
| `lib/i18n/translations.ts` | New `onboarding.*` and signup keys in English + Arabic. |
| `app/globals.css` | Onboarding styles + `form-grid--two` (existing design tokens). |
| `app/signup/page.test.tsx` | Rewritten for the new fields/flow. |
| `components/onboarding/StoreInfoStep.test.tsx` | New. |
| `app/onboarding/page.test.tsx` | New. |
| `e2e/onboarding.spec.ts` | New full merchant-journey E2E. |

### Flow

```text
/ → Start Selling → /signup → Supabase signUp →
  email confirmation required? → confirmation screen → login → onboarding
  session returned? → /onboarding
/onboarding:
  Step 1 Store info → POST /onboarding/merchant → (User + Store + OWNER + trial)
  Step 2 Appearance → PUT /theme (optional)
  Step 3 First product → POST /products (+ variant price) (optional)
  Step 4 Launch checklist → /dashboard
```

### Dashboard integration

`/auth/me` resolves the new Store/membership immediately after onboarding, so
the existing dashboard renders the merchant's own tenant context. All existing
routes are untouched:
`/dashboard`, `/dashboard/products(/*)`, `/dashboard/categories(/*)`,
`/dashboard/customers(/*)`, `/dashboard/orders(/*)`, `/dashboard/media`,
`/dashboard/settings`, `/dashboard/store`.

### Storefront

Unchanged. The merchant storefront remains separate from the marketing site,
resolved by slug/domain through the existing `StorefrontStoreResolver` (public
storefront API). A final public URL strategy (DNS/wildcard subdomain) remains a
deployment concern — documented here, not invented.

## 4. Subscription

Unchanged behavior. The TRIAL subscription is created atomically with each
Store (US-SUB-001), and the existing `SubscriptionAccessGuard` (read-only
dashboard on EXPIRED) applies to the merchant dashboard. No billing was added.

## 5. Tests

- API unit: `onboarding.service.spec.ts` (13) — valid creation, idempotent
  retry, slug/email conflict, concurrent provisioning, status states.
- API e2e: `onboarding.e2e-spec.ts` (12) — endpoint contract, idempotency,
  validation, role injection rejection, tenant isolation (store/products/
  orders/customers), 401 boundary.
- Web unit: signup (7), StoreInfoStep (5), onboarding page (4).
- E2E (requires real Supabase + PostgreSQL + servers): `e2e/onboarding.spec.ts`
  — marketing site → signup → onboarding → dashboard → store context → first
  product → product in store.

## 6. Validation results

| Check | Result |
| --- | --- |
| `npm run typecheck` (api + web) | PASS |
| `npm run lint` (api + web) | PASS |
| API unit (`npm run test -w @ziad/api`) | PASS — 117 suites / 876 tests |
| API e2e (`npm run test:e2e -w @ziad/api`) | PASS — 17 suites / 402 tests (262 DB-blocked suites skipped) |
| Web unit (`npm run test -w @ziad/web`) | PASS — 9 suites / 52 tests |
| Production build (`npm run build`) | PASS (API + Next.js) |
| Web E2E (Playwright, live infra) | NOT RUN — requires a real Supabase project + PostgreSQL (not present in this environment) |

## 7. Remaining limitations / documented decisions

1. **Live E2E** requires a configured Supabase project (URL + anon key), a
   reachable PostgreSQL (DATABASE_URL/DIRECT_URL), and the email-confirmation
   setting expected by the spec. None are present in this environment.
2. **Store logo** is not part of onboarding: the theme `logoMediaId` requires a
   Media row, whose binary upload depends on Supabase Storage credentials
   (fails closed otherwise). Merchants can configure the logo later via the
   Media/Theme modules once storage is provisioned.
3. **Multi-store merchants** without an explicit `X-Store-Id` are routed to
   their first store (server-resolved from `GET /onboarding/status`). A store
   switcher UI is still out of scope; the existing `X-Store-Id` selection
   mechanism remains intact.
4. **Public storefront URL strategy** (wildcard subdomain / DNS) is a
   deployment concern, not implemented here.
5. **Store name in non-Latin scripts** (e.g. Arabic) yields an empty slug; the
   merchant must provide an ASCII slug. The existing slug rule
   (`store-slug.ts`) is unchanged.
