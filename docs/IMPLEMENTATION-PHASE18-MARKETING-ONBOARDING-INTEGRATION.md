# Phase 18 — Connect the Merchant Marketing Website to the Merchant Onboarding Flow

Connects the public marketing website to the Phase 17 signup + onboarding flow so
the complete merchant journey is one seamless path:

```
Marketing Website → Start Selling → Signup → Authentication → Onboarding
→ Create Store → Configure Store → Add First Product → Launch → Dashboard
```

This phase adds NO new backend APIs, database fields, pricing, statistics, or
features. It only wires the existing pieces together and closes the remaining
integration gaps.

---

## 1. What was already in place (Phase 17)

- `/` marketing homepage with `Start Selling` → `/signup`, `See Demo` → `/demo`.
- `/signup` creates the Supabase Auth account (password never stored in our
  database) and redirects to `/onboarding` when a session is returned.
- `/onboarding` four-step flow (Store information → Appearance → First product →
  Launch) backed by `POST /api/v1/onboarding/merchant` (idempotent, atomic
  User + Store + OWNER membership + TRIAL subscription), the Theme API, and the
  Catalog API.
- `GET /api/v1/onboarding/status` for routing an authenticated merchant who has
  no resolvable tenant yet.
- `DashboardGate` protecting `/dashboard/*`.

## 2. Gaps closed in this phase

| Area | Change |
| --- | --- |
| Marketing navbar | Added the `Demo` link to the public navigation (Home, Features, How It Works, Pricing, FAQ, Demo, Login, Start Selling). |
| Marketing navbar (logged-in) | The primary CTA becomes **Go to Dashboard** (`/dashboard`) for a signed-in merchant instead of repeating the signup funnel. Login/Start Selling are hidden from the navbar while a session exists. |
| Merchant routing | Added a single source of truth `lib/auth/merchant-route.ts` (`merchantHomePath`). Login, `DashboardGate`, and the onboarding page all use it: store → `/dashboard`, no store → `/onboarding`. |
| Login routing | The login page routes directly to `/onboarding` when the merchant has no store, avoiding a `/dashboard` → `/onboarding` bounce. |
| Signup errors | Known Supabase Auth errors are localized (`auth.emailInUse`, `auth.signupRateLimited`, `errors.NETWORK`); unknown messages stay verbatim. |
| Launch step | Added a "Dashboard and storefront" card making the merchant admin vs customer-facing storefront split explicit, plus the development storefront URL note. |
| Loading states | The marketing navbar holds a stable CTA spacer while the session resolves, so a signed-in merchant never sees the signup button flash. |

## 3. Files changed

### New files

| File | Purpose |
| --- | --- |
| `apps/web/lib/auth/use-supabase-session.ts` | Lightweight Supabase session observer for public surfaces (no backend calls). |
| `apps/web/lib/auth/merchant-route.ts` | Single source of truth: authenticated merchant home path. |
| `apps/web/lib/auth/merchant-route.test.ts` | Unit tests for `merchantHomePath`. |
| `apps/web/components/dashboard/DashboardGate.test.tsx` | Routing tests: unauthenticated → `/login`, authenticated no store → `/onboarding`, authenticated with store → shell, loading → spinner. |
| `apps/web/components/onboarding/AppearanceStep.test.tsx` | Theme load, save, skip, invalid-color tests. |
| `apps/web/components/onboarding/FirstProductStep.test.tsx` | First-product creation + variant price, validation, error, skip tests. |
| `apps/web/components/onboarding/LaunchStep.test.tsx` | Launch checklist, store details, dashboard/storefront roles, dashboard navigation. |
| `docs/IMPLEMENTATION-PHASE18-MARKETING-ONBOARDING-INTEGRATION.md` | This document. |

### Modified files

| File | Change |
| --- | --- |
| `apps/web/components/marketing/MarketingNavbar.tsx` | Added `Demo` nav link + signed-in "Go to Dashboard" CTA (desktop and mobile). |
| `apps/web/app/globals.css` | `.mk-nav__cta-spacer` + `.onboarding__roles` / `.onboarding__storefront-note` styles. |
| `apps/web/lib/i18n/translations.ts` | New keys in English + Arabic: `marketing.nav.demo`, `marketing.nav.goToDashboard`, `auth.emailInUse`, `auth.signupRateLimited`, `onboarding.launch.rolesTitle`, `onboarding.launch.dashboardRole`, `onboarding.launch.storefrontRole`, `onboarding.launch.storefrontUrlNote`. |
| `apps/web/app/signup/page.tsx` | Localized Supabase signup errors. |
| `apps/web/app/login/page.tsx` | Routes through `merchantHomePath(store)` after authentication. |
| `apps/web/components/dashboard/DashboardGate.tsx` | Uses `merchantHomePath` for the no-store redirect. |
| `apps/web/app/onboarding/page.tsx` | Uses `merchantHomePath` for the already-onboarded redirect. |
| `apps/web/components/onboarding/LaunchStep.tsx` | Added the Dashboard vs Storefront roles card + storefront URL note. |
| `apps/web/app/(marketing)/page.test.tsx` | Updated for the session-aware navbar (Demo link, signed-in CTA). |
| `apps/web/app/signup/page.test.tsx` | Updated for localized signup errors. |

## 4. Routes connected

| Route | Behavior |
| --- | --- |
| `/` | Marketing homepage. CTAs: Start Selling → `/signup`, See Demo → `/demo`. Never creates a store directly. |
| `/demo` | Public demo tour, no authentication required. |
| `/signup` | Supabase Auth account creation (first name, last name, store name, email, password). Session returned → `/onboarding`. No session (email confirmation) → confirmation screen → login. |
| `/login` | Authenticated with a store → `/dashboard`; authenticated without a store → `/onboarding`; unauthenticated → form. |
| `/onboarding` | New merchant flow (4 steps). Already onboarded → `/dashboard`. |
| `/dashboard/*` | `DashboardGate`: unauthenticated → `/login`, no store → `/onboarding`, store → admin shell. |

## 5. Integration flow

### New merchant

```
/ → Start Selling → /signup → Supabase signUp (session returned)
→ /onboarding
  → Step 1 Store info → POST /api/v1/onboarding/merchant
      (atomic, idempotent: User + Store + OWNER ACTIVE membership + TRIAL subscription)
  → Step 2 Appearance → GET/PUT /api/v1/theme
  → Step 3 First product → POST /api/v1/products (+ PATCH /variants/:id price)
  → Step 4 Launch → Go to dashboard → /dashboard
```

### Existing merchant

```
/login → Supabase signIn → AuthProvider resolves via /auth/me
  → GET /api/v1/onboarding/status fallback when no tenant is resolvable yet
  → store exists → /dashboard
  → no store → /onboarding
```

The same status-based routing runs after signup, login, browser refresh, and
session restoration (the AuthProvider bootstrap path).

## 6. Tenant isolation

Unchanged from Phase 17. Store creation derives the tenant server-side from the
verified identity; every catalog/order/customer/inventory query is store-scoped
through the trusted tenant context. Merchant A can never read or write merchant B's
data (covered by `apps/api/test/onboarding.e2e-spec.ts` and the existing isolation
suite).

## 7. Dashboard = Admin, Storefront = Customer-facing store

- The marketing website explains/sells the SaaS (`/`).
- The merchant dashboard (`/dashboard`) is the merchant admin.
- The merchant storefront is served by the public storefront API
  (`/api/v1/storefront*`), resolved from the public store slug/domain.
- The marketing homepage is NOT the merchant's storefront. The onboarding launch
  step now shows a dedicated "Dashboard and storefront" card making the split
  explicit.

## 8. Storefront URL status (no invented DNS)

Wildcard subdomains / a production DNS strategy are **not implemented**. This is
an OPEN DECISION documented in `docs/API-SPEC.md §46` and
`docs/IMPLEMENTATION-PHASE15-INTEGRATION-PRODUCTION-READINESS.md`.

For development the existing `StorefrontStoreResolver` supports:

1. `X-Storefront-Slug: <slug>` header (deterministic in any environment), and
2. Host-header subdomain parsing when the host ends with the configured
   `STOREFRONT_DOMAIN` (default `platform-domain.com`).

No new storefront DNS behavior was added in this phase.

## 9. Language support

Every newly added string exists in both English and Arabic in
`lib/i18n/translations.ts` (the Arabic dictionary is typed
`Record<TranslationKey, string>`, so a missing Arabic value is a compile error).
RTL is applied at the document level by the existing locale bootstrap.

## 10. Validation

Run from the repository root:

```bash
npm run typecheck -w @ziad/api
npm run typecheck -w @ziad/web
npm run lint -w @ziad/api
npm run lint -w @ziad/web
npm run test -w @ziad/api
npm run test -w @ziad/web
npm run build -w @ziad/api
npm run build -w @ziad/web
npm run test:e2e -w @ziad/api
```

The web Playwright suite (`npm run test:e2e -w @ziad/web`) needs real Supabase +
PostgreSQL + both servers running and is reported separately (see the phase
report). It is never faked.

## 11. Remaining blockers

1. **Public storefront URL strategy** (wildcard subdomain / DNS) remains an open
   deployment decision — documented, not invented.
2. **Web Playwright E2E** requires a real Supabase/PostgreSQL environment with
   the API on `:4000` and the web dev server on `:3000`; it cannot run in a bare
   CI checkout.

