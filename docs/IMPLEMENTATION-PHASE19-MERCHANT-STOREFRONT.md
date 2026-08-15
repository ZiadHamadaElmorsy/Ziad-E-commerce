# PHASE 19 — PRODUCTION READINESS & MERCHANT STOREFRONT

**Status:** PASS — the merchant-to-customer storefront journey is implemented end to end
(Marketing → Signup → Onboarding → Dashboard → Configure Store → **View Store** → Storefront →
Browse → Product Details → Variant → Cart → Checkout → Payment (Paymob) → Order Confirmation →
Merchant Dashboard → Order appears).

The payment leg is **fully wired** but **environment-blocked**: this environment's
`PAYMOB_*` credentials are placeholders, so payment initiation fails closed (409) exactly as
designed. No fake payment was created and no test pretends the live Paymob card flow passed.

---

## 1. What was implemented

### Backend (NestJS API)

A **public storefront commerce surface** on top of the existing modules (docs/API-SPEC.md §36
"Public": cart operations where guest sessions are supported, checkout initiation, payment
redirect/result). The store is **always resolved server-side by the existing
`StorefrontStoreResolver`** (`X-Storefront-Slug` header + Host-subdomain fallback) — a
client-supplied store id is never an authorization source.

New module `apps/api/src/storefront-commerce/`:

- `StorefrontCommerceController` — `@Public()` guest endpoints under `/api/v1/storefront/**`.
- `StorefrontCommerceService` — thin bridge: resolves the store once, then delegates to the
  existing `CartService`, `CheckoutService`, `PaymentsService`, `OrderRepository`,
  `ThemeService`, `NavigationService` and the Media `StorageProvider` with the resolved
  store id. **No business logic is duplicated.**
- Public order confirmation view (`StorefrontOrderView`) — the order aggregate + latest
  payment state (webhook-driven).

Supporting additive changes to existing modules (no behavior change for the merchant path):

- `CartService`, `CheckoutService`, `PaymentsService`, `ThemeService`, `NavigationService`,
  `InventoryService.getInventory` — optional trusted `storeId` parameter (merchant path keeps
  deriving it from the tenant context; the public path passes the server-resolved store).
- `StorageProvider` — added `downloadObject(key)` (implemented in `SupabaseStorageProvider`)
  so the public storefront can stream **store-scoped** media binaries through the API.
- `StorefrontModule`, `CartModule`, `CheckoutModule`, `OrdersModule`, `PaymentsModule`,
  `CmsModule`, `MediaModule` — exported the services/repositories the storefront bridge
  reuses.
- `StorefrontRepository.findMediaInStore` — store-scoped media lookup for the proxy.

### Frontend (Next.js web app)

A real customer storefront under `/store/[slug]/…` that consumes **real store data** through
the public storefront APIs:

- Store home (branding, categories, products), product listing (search + pagination),
  product details (gallery, variant selection, quantity, availability, Add to Cart),
  category listing + category page, CMS pages, guest cart, checkout, Paymob payment step,
  order confirmation page.
- `StorefrontProvider` loads store + theme + navigation and manages the **guest cart**
  (`X-Guest-Token` persisted per slug in `localStorage`). Theme colors/fonts are applied as
  CSS variables (`--sf-primary`, `--sf-primary-soft`, `--sf-font`).
- Store media (product images, logo) is streamed through the header-based storefront media
  proxy and rendered as blob URLs — no new tenant-resolution mechanism.
- **View Store** actions in the dashboard home, Store settings, onboarding Launch step, and
  the admin sidebar.
- English/Arabic with RTL (reuses the existing i18n provider and logical CSS properties),
  responsive desktop/tablet/mobile, loading/empty/error states, toasts.

---

## 2. Files changed

### Backend — new

```
apps/api/src/storefront-commerce/storefront-commerce.module.ts
apps/api/src/storefront-commerce/storefront-commerce.types.ts
apps/api/src/storefront-commerce/controllers/storefront-commerce.controller.ts
apps/api/src/storefront-commerce/services/storefront-commerce.service.ts
apps/api/src/storefront-commerce/services/storefront-commerce.service.spec.ts
apps/api/test/storefront-commerce.e2e-spec.ts
```

### Backend — modified (additive)

```
apps/api/src/app.module.ts                          (+StorefrontCommerceModule)
apps/api/src/cart/services/cart.service.ts          (optional storeId)
apps/api/src/checkout/services/checkout.service.ts  (optional storeId/status)
apps/api/src/payments/services/payments.service.ts  (optional storeId)
apps/api/src/inventory/services/inventory.service.ts (optional storeId)
apps/api/src/cms/services/theme.service.ts          (optional storeId)
apps/api/src/cms/services/navigation.service.ts     (optional storeId)
apps/api/src/media/storage/storage-provider.ts      (+downloadObject)
apps/api/src/media/storage/supabase-storage-provider.ts (+downloadObject)
apps/api/src/media/media.module.ts                  (export StorageProvider)
apps/api/src/cms/cms.module.ts                      (export Theme/NavigationService)
apps/api/src/storefront/storefront.module.ts        (export resolver/repo/service)
apps/api/src/storefront/repositories/storefront.repository.ts (+findMediaInStore)
```

### Frontend — new

```
apps/web/lib/storefront/types.ts
apps/web/lib/storefront/paths.ts
apps/web/lib/storefront/guest-cart.ts
apps/web/lib/storefront/format.ts
apps/web/lib/storefront/storefront-context.tsx
apps/web/lib/api/storefront.ts
apps/web/lib/api/cart.ts
apps/web/components/storefront/*  (StorefrontShell, Header, Footer, ProductCard,
  ProductGrid, Price, StorefrontImage, SectionRenderer, StorefrontStates)
apps/web/app/store/storefront.css
apps/web/app/store/not-found.tsx
apps/web/app/store/[slug]/layout.tsx
apps/web/app/store/[slug]/page.tsx                     (home)
apps/web/app/store/[slug]/products/page.tsx            (listing + search + pagination)
apps/web/app/store/[slug]/products/[productSlug]/page.tsx (product details)
apps/web/app/store/[slug]/categories/page.tsx
apps/web/app/store/[slug]/categories/[categorySlug]/page.tsx
apps/web/app/store/[slug]/pages/[pageSlug]/page.tsx    (CMS pages)
apps/web/app/store/[slug]/cart/page.tsx
apps/web/app/store/[slug]/checkout/page.tsx
apps/web/app/store/[slug]/orders/[orderId]/page.tsx    (confirmation)
apps/web/e2e/storefront.spec.ts
apps/web/lib/storefront/paths.test.ts
apps/web/lib/storefront/format.test.ts
apps/web/lib/storefront/guest-cart.test.ts
apps/web/lib/storefront/storefront-context.test.tsx
apps/web/components/storefront/storefront-components.test.tsx
```

### Frontend — modified

```
apps/web/app/dashboard/page.tsx             (View Store button)
apps/web/app/dashboard/store/page.tsx       (View Store button)
apps/web/components/dashboard/Sidebar.tsx   (View Store link)
apps/web/components/dashboard/AdminShell.tsx (pass store slug)
apps/web/components/onboarding/LaunchStep.tsx (View Store CTA)
apps/web/lib/i18n/translations.ts           (storefront.* EN + AR keys)
```

---

## 3. New routes

### Backend (all `@Public()`, store resolved from `X-Storefront-Slug` / Host subdomain)

```
GET    /api/v1/storefront/cart
POST   /api/v1/storefront/cart/items
PATCH  /api/v1/storefront/cart/items/:itemId
DELETE /api/v1/storefront/cart/items/:itemId
DELETE /api/v1/storefront/cart/items
POST   /api/v1/storefront/checkout
POST   /api/v1/storefront/orders/:orderId/payments
GET    /api/v1/storefront/orders/:orderId/payment
GET    /api/v1/storefront/orders/:orderId
GET    /api/v1/storefront/theme
GET    /api/v1/storefront/navigation
GET    /api/v1/storefront/media/:mediaId/content
```

### Frontend

```
/store/[slug]                       store home
/store/[slug]/products              product listing (search + pagination)
/store/[slug]/products/:productSlug product details
/store/[slug]/categories            category listing
/store/[slug]/categories/:categorySlug category page
/store/[slug]/pages/:pageSlug       CMS page (published only)
/store/[slug]/cart                  guest cart
/store/[slug]/checkout              checkout + Paymob payment step
/store/[slug]/orders/:orderId       order confirmation
```

---

## 4. Existing APIs reused

- `GET /storefront`, `/storefront/products`, `/storefront/products/:slug`,
  `/storefront/categories`, `/storefront/categories/:slug`, `/storefront/pages/:slug`
  (Phase 11 public storefront reads).
- Cart API domain (Phase 6) — `CartService` (guest tokens, availability checks,
  merges, expiry).
- Checkout API domain (Phase 7) — `CheckoutService` (order creation, customer
  find-or-create, idempotency, reservations).
- Orders domain (Phase 8) — `OrderRepository.findWithDetails`.
- Payments domain (Phase 9) — `PaymentsService` + the **real `PaymobPaymentProvider`**
  (auth → order register → payment key → iframe URL), HMAC webhook
  `POST /webhooks/paymob`, payment lifecycle transitions.
- CMS domain (Phase 12) — `ThemeService`, `NavigationService`.
- Media domain (Phase 13) — `StorageProvider` (Supabase Storage).
- Identity/Tenant (Phase 2) — the existing `StorefrontStoreResolver` (slug header +
  Host subdomain) and the merchant tenant context for the dashboard.
- Inventory (Phase 4) — reservation on checkout, consumption/release on payment
  webhook, `InventoryService.getInventory`.

## 5. New APIs (backend)

Only the **public storefront guest surface** in §3 is new. No new tables, no schema
migration, no new database models — the FINAL Prisma schema is unchanged.

---

## 6. Storefront routing strategy

- **Local development:** the web storefront lives at `/store/[slug]/…`; the web client sends
  `X-Storefront-Slug: <slug>` on every storefront API call. The backend resolves the store
  with the existing `StorefrontStoreResolver` (header first, Host-subdomain fallback) — the
  same mechanism the Phase 11 report documented.
- **Production wildcard subdomains (`merchant-slug.yourdomain.com`) are NOT configured** in
  this environment. The architecture is ready for it: the resolver already parses
  `my-store.platform-domain.com` from the `Host` header (configurable via
  `STOREFRONT_DOMAIN`), so deploying the storefront at `{slug}.yourdomain.com` requires only
  DNS + reverse-proxy changes — no code change. This is listed under Remaining production
  requirements.
- **No new tenant-resolution mechanism was invented.** The media proxy, theme, navigation,
  cart, checkout, payment and order endpoints all use the same server-side slug resolution.

---

## 7. Cart / checkout flow

```
Product → Add to Cart → Cart (update qty / remove / clear) → Checkout form
→ POST /storefront/checkout (Idempotency-Key) → PENDING order + ACTIVE reservation
```

- Guest carts only (the documented guest path; customer accounts are not in MVP scope).
  The opaque `X-Guest-Token` is persisted per slug in `localStorage`.
- Cart pricing is display-only; checkout revalidates product/variant/inventory/price/totals
  server-side (unchanged domain rules).
- Checkout collects exactly the backend contract: `customer.name`, `customer.phone`,
  `customer.email?`, `shippingAddress.{governorate, city, addressLine, building?, apartment?}`.
  All required fields are validated client-side and server-side.
- No card data is ever collected or stored in the application.

## 8. Payment flow

```
Checkout → Order (PENDING) → POST /storefront/orders/:orderId/payments (Idempotency-Key)
→ Paymob (auth → order register → payment key) → providerCheckoutUrl (Paymob iframe)
→ Customer pays on Paymob → webhook POST /webhooks/paymob (HMAC verified, deduped)
→ payment SUCCEEDED + reservation CONSUMED + order CONFIRMED (or FAILED + released)
```

- The **existing** Paymob provider, payment lifecycle, webhook handling and HMAC validation
  are reused unchanged. No payment logic was duplicated.
- The checkout page renders the provider-hosted iframe from `providerCheckoutUrl` and the
  confirmation page polls the order/payment status while PENDING/PROCESSING.
- Payment status is **never** trusted from the browser — only the verified webhook drives
  state changes. The confirmation page shows real `paymentStatus` data.

---

## 9. Inventory behavior

- Cart add/update validates availability (existing rule: a missing inventory row fails
  closed).
- Checkout reserves atomically (existing `InventoryReservationService`): `Product Stock=10`,
  customer checks out qty 2 → `reserved=2`, on-hand unchanged.
- Payment webhook consumes (ACTIVE → CONSUMED) or releases (FAILED → RELEASED) reservations —
  unchanged domain behavior, verified live: a failed (environment-blocked) payment left
  `reserved=2` on the order.
- Over-purchase is rejected with `INSUFFICIENT_INVENTORY` (verified live).

## 10. CMS / theme integration

- `GET /storefront/theme` and `GET /storefront/navigation` (public, store-resolved) expose the
  merchant's configured theme (primaryColor, fontFamily, logoMediaId) and navigation
  (PAGE/CATEGORY/DESTINATION items) using the existing Theme/Navigation services.
- The storefront shell applies the theme as CSS variables; logo + product media stream
  through the store-scoped media proxy.
- CMS pages render PUBLISHED pages only (the backend filters `PageStatus.PUBLISHED`) and their
  sections (`hero` / `banner` / `featured_products` / `category_grid` / `text` / `image`).
- There is **no drag-and-drop page builder** — the docs/MVP scope does not include one, and
  none is claimed.

## 11. Tenant isolation

Every public storefront operation resolves the store **server-side** from the slug and passes
that resolved store id into the existing store-scoped services/repositories:

- Products/categories/pages: store-scoped ACTIVE/PUBLISHED filters (Phase 11, unchanged).
- Cart: `X-Guest-Token` only selects a cart inside the resolved store.
- Order lookup: store-scoped `findWithDetails` → cross-tenant order id returns 404.
- Media: `findMediaInStore(storeId, mediaId)` → cross-tenant media id returns 404.
- Theme/navigation: store-scoped singleton reads.
- Checkout/payment: the existing services run inside tenant-bound transactions with the
  resolved store id.

Automated proof: `storefront-commerce.service.spec.ts` (cross-tenant order/media → 404),
`storefront-commerce.e2e-spec.ts` (unknown guest token → 404, cross-tenant order → 404,
cross-tenant media → 404), and the existing Phase 15 system-integration isolation specs.

---

## 12. Tests executed

### Web unit (Vitest + Testing Library) — 91 passing
Storefront routing helpers, money formatting, guest-token persistence, `StorefrontProvider`
(loading→data, theme CSS variables, store-not-found error, add/update/remove/clear cart with
token persistence), ProductCard (name/price/out-of-stock/link), SectionRenderer
(hero/text), empty state — plus the pre-existing suite.

### API unit (Jest) — 891 passing
New `StorefrontCommerceService` spec (store resolution, cart/checkout/payment delegation with
the resolved store id, order confirmation + payment state, cross-tenant isolation,
theme/navigation delegation, store-scoped media proxy) — plus the pre-existing suite.

### API e2e (Jest, mocked Prisma) — 423 passing / 262 skipped
New `storefront-commerce.e2e-spec.ts` (anonymous access to all new endpoints, store
resolution failures, guest cart lifecycle, checkout, payment with Idempotency-Key +
providerCheckoutUrl, order confirmation + cross-tenant isolation, theme/navigation, media
proxy). The 262 skipped tests are the pre-existing environment-blocked database/RLS suites.

### Web e2e (Playwright)
`e2e/storefront.spec.ts` — merchant → create + publish product → open storefront → browse →
product details → add to cart → cart → checkout. The **live Paymob payment test is
`test.skip`-guarded**: it only runs when real `PAYMOB_*` credentials are present; with
placeholder credentials it is explicitly skipped (never faked).

### Live verification (real Supabase DB)
Booted the real API and verified against the real store `ziad-store`:
- `GET /storefront`, `/products`, `/categories`, `/theme`, `/navigation` return real data.
- Guest cart create + retrieve via `X-Guest-Token` (200).
- Add-to-cart fail-closed: `INSUFFICIENT_INVENTORY` (409) and non-purchasable variant (409).
- Checkout → `ORD-2026-000001` created (201) with snapshot items, customer and an ACTIVE
  reservation; inventory `reserved=2`.
- Payment initiation → 409 `Payment initiation failed.` (Paymob placeholders); payment +
  attempt recorded as `FAILED / INITIATION_FAILED`; order confirmation view reports
  `paymentStatus: FAILED`.
- Unknown storefront slug → 404; unknown order → 404 (no existence leak).

---

## 13. Validation results

| Command | Result |
| --- | --- |
| `npm run typecheck -w @ziad/api` | ✅ PASS |
| `npm run typecheck -w @ziad/web` | ✅ PASS |
| `npm run lint -w @ziad/api` | ✅ PASS |
| `npm run lint -w @ziad/web` | ✅ PASS |
| `npm run test -w @ziad/api` | ✅ PASS (891 tests) |
| `npm run test -w @ziad/web` | ✅ PASS (91 tests) |
| `npm run build -w @ziad/api` | ✅ PASS |
| `npm run build -w @ziad/web` | ✅ PASS (storefront routes compiled) |
| `npm run test:e2e -w @ziad/api` | ✅ PASS (423 passed, 262 skipped) |
| `npm run test:e2e -w @ziad/web` | ⚠️ Requires the full stack (API + web + Supabase + a merchant session) + real Paymob for the live payment leg; the non-payment journey is covered by `e2e/storefront.spec.ts` |

## 14. Environment blockers

1. **Paymob credentials are placeholders** (`PAYMOB_API_KEY`, `PAYMOB_INTEGRATION_ID`,
   `PAYMOB_IFRAME_ID`, `PAYMOB_HMAC_SECRET`). The provider fails closed on initiation (409),
   so the live card-payment leg (Paymob iframe → real card → webhook → order CONFIRMED) cannot
   be exercised in this environment. The web e2e payment test is explicitly skipped; the API
   e2e uses an overridden provider stub; the webhook processor is already covered by the
   existing Phase 9 specs.
2. **Database/RLS suites** (262 API e2e tests) require a local PostgreSQL with RLS policies
   and remain skipped, per the established convention.
3. **Wildcard production subdomains** are not deployed — see §6 and §15.

## 15. Remaining production requirements

1. Configure real **Paymob** credentials + the Paymob dashboard callback/return URL and run
   the live payment E2E.
2. Deploy **wildcard subdomains** (`{slug}.yourdomain.com`) via DNS + reverse proxy and set
   `STOREFRONT_DOMAIN`; the resolver and the storefront are already prepared.
3. Add **rate limiting** on public storefront/checkout/payment endpoints (API-SPEC §37) at
   deployment time.
4. Customer **accounts / authenticated carts** remain out of MVP scope (guest checkout is the
   documented path).
5. Periodic **cart expiry sweep** and **reservation expiry sweep** are documented as future
   operational jobs (no periodic job exists in the MVP).
6. Run the web Playwright suite (`npm run test:e2e -w @ziad/web`) against the full local stack
   with a real merchant session.

---

## 16. Exact commands to run the complete system locally

```bash
# 1. Install + generate the Prisma client
npm install

# 2. Start the API (http://localhost:4000) and the web app (http://localhost:3000)
npm run dev            # both in watch mode
# or individually:
#   npm run dev:api
#   npm run dev:web

# 3. Run migrations against the configured database (Supabase/local Postgres)
npm run db:deploy

# 4. From the dashboard (login as a merchant) click "View Store" — or open:
#    http://localhost:3000/store/<your-store-slug>

# Validation
npm run typecheck -w @ziad/api && npm run typecheck -w @ziad/web
npm run lint -w @ziad/api && npm run lint -w @ziad/web
npm run test -w @ziad/api && npm run test -w @ziad/web
npm run build -w @ziad/api && npm run build -w @ziad/web
npm run test:e2e -w @ziad/api
npm run test:e2e -w @ziad/web   # requires the full stack + a merchant session
```

PHASE 19 — PRODUCTION READINESS & MERCHANT STOREFRONT COMPLETE.
