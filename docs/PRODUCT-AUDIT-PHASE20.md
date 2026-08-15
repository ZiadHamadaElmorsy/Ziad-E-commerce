# PHASE 20 — FULL PRODUCT AUDIT & GAP ANALYSIS

**Status:** COMPLETE — audit of the Phase 19 product state. No new features were implemented, no
architecture was changed, and no code was modified except for temporary read-only probes that have
been removed. The report below is based on direct source inspection, executed validation commands,
and live API/database verification.

**Verdict:** **GO WITH CONDITIONS** — see §30.

---

# 1. Executive Summary

Ziad E-commerce has a genuinely complete, well-architected merchant → customer journey:

```
Marketing → Signup → Login → Onboarding → Dashboard → Configure Store → View Store →
Storefront → Products → Product Details → Variants → Cart → Checkout → Paymob → Order
Confirmation → Merchant Orders
```

Everything claimed in the implementation-phase documents was found to actually exist in the source
code, with three notable documentation-vs-reality discrepancies (§2.1). The backend is a disciplined
modular monolith with a consistent guard chain (`AuthGuard → TenantContextGuard → RolesGuard →
SubscriptionAccessGuard`), strict DTO validation, tenant-safe repositories, guarded state
transitions, idempotency on checkout/payment/webhooks, and immutable inventory movements. The
frontend is real-data only — no mocked dashboard numbers, no fake storefront content.

**Validation executed in this phase (all PASS):**

| Command | Result |
| --- | --- |
| `npm run typecheck -w @ziad/api` | ✅ PASS |
| `npm run typecheck -w @ziad/web` | ✅ PASS |
| `npm run lint -w @ziad/api` | ✅ PASS |
| `npm run lint -w @ziad/web` | ✅ PASS |
| `npm run test -w @ziad/api` | ✅ PASS — 891 tests / 118 suites |
| `npm run test -w @ziad/web` | ✅ PASS — 91 tests / 19 suites |
| `npm run build -w @ziad/api` | ✅ PASS |
| `npm run build -w @ziad/web` | ✅ PASS (all storefront routes compiled) |
| `npm run test:e2e -w @ziad/api` | ✅ PASS — 423 passed, 262 skipped (14 RLS/database suites BLOCKED: require a local PostgreSQL with the RLS policy set) |
| `npm run test:e2e -w @ziad/web` | ⚠️ BLOCKED — requires the full stack (web server on :3000 not running in this audit, Playwright browsers not installed) + a real merchant session |


**Live verification executed in this phase (real Supabase database, real running API on :4000):**

| Probe | Result |
| --- | --- |
| `GET /health` | `{"status":"ok","database":"up"}` |
| `GET /storefront` (slug `ziad-store`) | ✅ real store data returned |
| `GET /storefront/products` | ✅ 4 ACTIVE products returned |
| `GET /storefront/theme` · `GET /storefront/navigation` | ✅ real rows returned |
| `GET /storefront` (unknown slug) | ✅ 404 (fail closed) |
| `GET /storefront/media/<fake-id>/content` | ✅ 404 (cross-tenant fail closed) |
| `GET /products` without token | ✅ 401 |
| `POST /storefront/cart/items` (variant with no inventory) | ✅ `INSUFFICIENT_INVENTORY` (fail closed) |
| Database row counts | 1 store, 2 users, 65 products, 105 variants, 38 categories, **0 subscriptions, 0 orders, 0 payments, 0 media** |

**Headline findings**

- 🔴 **Paymob credentials are placeholders** (`PAYMOB_API_KEY=YOUR_..._KEY`, `PAYMOB_INTEGRATION_ID`,
  `PAYMOB_IFRAME_ID`, `PAYMOB_HMAC_SECRET` all placeholder-shaped, verified in `.env`). Payment
  initiation fails closed with 409. **No live card payment has ever been processed.** The webhook
  HMAC field list is implemented but explicitly unverified against a real Paymob callback.
- 🔴 **Wildcard storefront domains are not deployed.** `STOREFRONT_DOMAIN=platform-domain.com`
  (default placeholder). The storefront is only reachable under the dev path `/store/[slug]` with
  an `X-Storefront-Slug` header.
- 🔴 **No rate limiting** on any endpoint, including the public storefront cart/checkout/payment
  surface (API-SPEC §37 is a documented deployment-time TODO).
- 🟠 **The RLS foundation is not actually enforced by the live connection.** The API connects as
  `postgres` (table owner), which bypasses RLS; the migration enables RLS but does not `FORCE ROW
  LEVEL SECURITY` and the API never runs as the `authenticated` role. Tenant isolation currently
  depends entirely on application-level store-scoping (which is consistently present — see §15).
- 🟠 **No periodic jobs exist.** Abandoned checkouts leave PENDING orders with ACTIVE inventory
  reservations that no sweep releases, and EXPIRED carts are only lazily transitioned on access.
  In a live merchant store this permanently reduces sellable stock unless every customer completes
  payment.
- 🟠 **The web E2E suite has never run in this environment** (Playwright browsers not installed),
  and **262 API E2E tests covering the RLS/database layer are skipped** for lack of a local RLS
  Postgres.
- 🟠 **CMS/theme/navigation have no merchant dashboard UI** — pages, sections, navigation and logo
  are API-only; a non-technical merchant cannot manage them from the dashboard.
- 🟠 **Onboarding's "create your first product" does not set inventory** — the resulting product is
  unpurchasable on the storefront (verified live: every ACTIVE variant in the database has a NULL
  inventory row, so every storefront product is "out of stock").

**Counts**

| Severity | Count |
| --- | --- |
| 🔴 CRITICAL | 4 |
| 🟠 HIGH | 11 |
| 🟡 MEDIUM | 16 |
| 🟢 LOW | 7 |

**Top 10 risks** are listed in §26; the recommended roadmap is in §28.


---

# 2. Current Product State

## 2.1 Documentation vs. implementation reality

| Documented | Implementation reality |
| --- | --- |
| Phase 19 "payment leg fully wired" | True for code wiring, but environment-blocked: `PAYMOB_*` placeholders, provider fails closed (verified). No live payment has ever been made. |
| Phase 19 "the web e2e journey is covered by `e2e/storefront.spec.ts`" | The spec exists and is well written, but has never been executed here: Playwright browsers are not installed, the web dev server is not running, and a merchant session is required. **Not counted as passed.** |
| RLS foundation (DATABASE.md §29, migration) | Migration `20260812000000_init` creates `app.set_current_store_id`, enables RLS on all 28 tables and creates per-table policies for the `authenticated`/`anon` roles. **But** the live API connects as `postgres` (owner), which bypasses RLS; policies are never evaluated by the app's own queries. |
| README "Current phase: Phase 0 — No business features implemented" | Stale. The repo is at Phase 19 with a full storefront. |
| `SupabaseStorageProvider`/`SupabaseAuthProvider` comments "credentials not present in the current environment" | Stale comments. `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` are real (`eyJ...`) in `.env`; live Auth works and live Storage is configured (no uploads exist in the live DB yet, so storage was not exercised in this audit). |

## 2.2 What exists (verified in source and live)

- 28-table PostgreSQL schema (Prisma + one initial migration with RLS, CHECK constraints,
  partial unique indexes, composite tenant FKs).
- NestJS API under `/api/v1` with global guards, whitelist DTO validation, Swagger (non-prod),
  CORS allowlist, centralized error envelope.
- Supabase Auth (server-side token verification via `GET /auth/v1/user`), Supabase Storage
  (service-role REST upload/download/delete).
- Identity/tenancy (User, Store, StoreMembership OWNER/ADMIN/STAFF), onboarding endpoint
  (idempotent User+Store+OWNER+TRIAL creation).
- Catalog (products, variants with SKU/price/compare-at/cost, categories, product-category links,
  publish/unpublish/archive), inventory (movements, reservations, guarded increments), customers
  (guest checkout, address book, list/detail/orders), cart (guest carts), checkout (transactional,
  revalidates prices, reserves inventory, snapshots order), orders (PENDING→…→DELIVERED state
  machine + cancellation), payments (Paymob provider, HMAC webhook, dedup, idempotency),
  subscription (TRIAL/ACTIVE/EXPIRED + dashboard read-only overlay + storefront disable),
  storefront (public read API), storefront-commerce (public guest cart/checkout/payment/order),
  CMS (pages/sections/navigation/theme), media (upload/metadata/delete + storefront proxy).
- Next.js frontend: marketing site, signup, login, onboarding (4 steps), dashboard
  (home/products/categories/orders/customers/media/settings/store), storefront
  (home/products/detail/cart/checkout/payment/order confirmation/CMS pages/categories), EN/AR + RTL,
  responsive.

## 2.3 What is missing (full detail in later sections)

Production credentials (Paymob), wildcard domains, rate limiting, background jobs (cart/reservation
expiry), CMS/theme/navigation dashboard UI, customer accounts, refunds, shipping cost engine,
fulfillment workflow, SEO metadata for storefronts, sitemap/robots, web E2E execution, CI, logging
infrastructure, monitoring, backups, error tracking.


---

# 3. Full Merchant Journey Audit

```text
Marketing → Start Selling → Signup → Email confirmation (if enabled) → Login → Onboarding
→ Create Store → Configure Store → Create Product → Create Variant → Set Price → Set
Inventory → Publish Product → View Store → Customer Storefront
```

| Step | Implemented? | Connected? | Real data? | Production-ready? | Notes |
| --- | --- | --- | --- | --- | --- |
| Marketing website | ✅ | ✅ | Static marketing content (by design) | ✅ | Sections + demo/privacy/terms; navbar CTA swaps to "Go to Dashboard" for signed-in merchants (`MarketingNavbar`, `useSupabaseSession`). |
| Start Selling | ✅ | ✅ | — | ✅ | CTA → `/signup`. |
| Signup | ✅ | ✅ | ✅ real Supabase Auth | ✅ | Email+password+first/last+store name; names in `user_metadata`; handles email-confirmation and direct-session flows; localized Supabase errors. Password never stored by the app. |
| Email confirmation | ✅ | ✅ | Supabase-managed | ✅ | When enabled the UI shows "check your inbox" (`needsConfirmation` state). |
| Login | ✅ | ✅ | ✅ | ✅ | `signInWithPassword` → `/auth/me` → route to dashboard or onboarding; 401 retry + session refresh in the API client. |
| Onboarding (4 steps) | ✅ | ✅ | ✅ | ✅ | Step 1 creates User+Store+OWNER+TRIAL idempotently (`POST /onboarding/merchant`); steps 2–4 configure theme + first product + launch checklist. |
| Create Store | ✅ | ✅ | ✅ | ✅ | `OnboardingService.createMerchant` in one transaction; slug derived server-side (`generateStoreSlug`); slug uniqueness enforced. |
| Configure Store | 🟡 Partial | ✅ | ✅ | 🟡 | Only the store **name** is editable in the dashboard; theme color/font editable only during onboarding. Description, currency, timezone, logo, CMS pages, navigation are not editable from the dashboard. |
| Create Product | ✅ | ✅ | ✅ | ✅ | `POST /products` creates product + default variant in one transaction (DRAFT). |
| Create Variant | ✅ | ✅ | ✅ | ✅ | Product detail page supports add/edit/archive variants with SKU, price, compare-at price. |
| Set Price | ✅ | ✅ | ✅ | ✅ | Piastres integer conversion, `>= 0` CHECK. |
| Set Inventory | 🟠 Partial | ✅ | ✅ | 🟠 | Only via the per-variant "Inventory" modal on the product detail page (INITIAL_STOCK adjustment). No dedicated Inventory page; no bulk; **onboarding's first-product flow does not set inventory**, so the created product is unpurchasable until the merchant finds the modal. |
| Publish Product | ✅ | ✅ | ✅ | ✅ | List + detail lifecycle controls with confirmation dialogs. |
| View Store | ✅ | ✅ | ✅ | ✅ | Dashboard home, Store page, onboarding Launch step and sidebar all link to `/store/<slug>`. |
| Customer Storefront | ✅ | ✅ | ✅ real data | 🟡 | See §6. Works live in dev path; no production URL until wildcard domains are deployed. |

**Journey-level issues**

1. **A merchant following onboarding end-to-end produces a store with an unpurchasable product**
   (no inventory row → out of stock). This is the single biggest "first merchant" UX trap and was
   verified live (§8).
2. **"Configure Store" is effectively name-only.** For a real merchant the storefront looks
   undifferentiated (default teal, no logo, empty navigation, no pages) and there is **no dashboard
   UI** to fix that (CMS/theme/navigation are API-only).
3. **No "what's broken" visibility.** If the storefront is unavailable (e.g. subscription expired)
   the merchant gets no dashboard warning; errors are only surfaced when they visit the storefront.
4. **No store switching UI.** A merchant with two stores cannot select between them in the UI
   (the API supports `X-Store-Id`, the web client never sends it) → `TENANT_CONTEXT_REQUIRED` until
   a store is chosen — and there is no chooser.


---

# 4. Full Customer Journey Audit

```text
Storefront Home → Products → Product Details → Select Variant → Add to Cart → Cart →
Checkout → Paymob Payment → Order Confirmation
```

| Step | Implemented? | Real data? | Loading/error/empty states | Production-ready? | Notes |
| --- | --- | --- | --- | --- | --- |
| Store home | ✅ | ✅ | ✅ | 🟡 | Branding, categories, products, empty state. No CMS "hero" sections rendered on home (home is a fixed layout; CMS pages are separate routes). |
| Product listing | ✅ | ✅ | ✅ | ✅ | Search + pagination (12/page), empty state, debounced search. |
| Product details | ✅ | ✅ | ✅ | ✅ | Variant radio selection (unavailable variants disabled), quantity, out-of-stock state, gallery thumbs. |
| Variant selection | ✅ | ✅ | ✅ | ✅ | `available` derived server-side (`on_hand - reserved > 0`); no inventory row ⇒ unavailable (fail closed). |
| Add to cart | ✅ | ✅ | ✅ | ✅ | Server-revalidated availability/quantity; guest token persisted per slug in localStorage. |
| Cart | ✅ | ✅ | ✅ | ✅ | Quantity +/-, remove, clear, subtotal. |
| Checkout | ✅ | ✅ | ✅ | ✅ | Validates name/phone/email/address; idempotent order creation; revalidates prices/inventory server-side; snapshots shipping address. |
| Payment (Paymob) | 🟠 Wired, never live | — | ✅ fail-closed | 🔴 | Provider iframe rendered from `providerCheckoutUrl`; with placeholder credentials initiation fails 409 and the customer sees a safe error. **No live card flow has ever been verified.** |
| Order confirmation | ✅ | ✅ | ✅ | ✅ | Real order + webhook-driven payment status, polls while PENDING/PROCESSING (8×3s), then stops. |

**Journey-level issues**

1. The only true blocker for customers is the **Paymob payment leg** — everything before and after
   it works against real data (verified live up to cart-add).
2. **Order lookup is unauthenticated by design** — anyone with the order UUID + store slug can view
   the order. UUIDs are unguessable, but orders are not protected by any customer auth. This is
   acceptable for a guest-checkout MVP, but it means customer PII (name/phone/email/address) is
   readable by anyone possessing the link.
3. **No customer accounts / order history page** — a returning customer cannot list their orders.
4. **Payment status polling gives up after ~24s** — if the Paymob webhook is slow, the customer
   must manually reload.


---

# 5. Dashboard Audit

| Area | State | Notes |
| --- | --- | --- |
| Dashboard home | ✅ Implemented | Real metrics (product/category/order counts, revenue via paginated sum capped at 50 pages), recent products/orders, empty states. |
| Sidebar / navigation | ✅ Implemented | Dashboard, Products, Categories, Orders, Customers, Media, Settings, Store + View Store link. |
| Products list | ✅ Implemented | Search, status filter, category filter, pagination, publish/unpublish/archive with confirmations. |
| Product create | ✅ Implemented | Name/description/status (DRAFT only). |
| Product detail | ✅ Implemented | Edit name/desc, variants CRUD+archive, categories assign/remove, inventory modal + movements, lifecycle controls. |
| Categories | ✅ Implemented | List (limit 100, no pagination), create, archive. |
| Variants | ✅ Implemented | Via product detail modal. No separate variants page (acceptable). |
| Inventory | 🟡 Partial | Per-variant modal only; no dedicated inventory page, no bulk, no low-stock view. |
| Orders list | ✅ Implemented | Search, status filter, pagination. |
| Order detail | ✅ Implemented | Status transitions (PENDING→CONFIRMED/CANCELLED→PROCESSING→SHIPPED→DELIVERED), payment initiation + attempts, address, items. |
| Customers list/detail | ✅ Implemented | Search, pagination, orders per customer. No customer editing. |
| Store settings | 🟡 Partial | Name only editable; currency/timezone read-only; payments section explicitly "not available yet". |
| Theme | 🟠 API-only | No dashboard page; only the onboarding AppearanceStep can change color/font. |
| CMS (pages) | 🔴 API-only | No dashboard UI for pages/sections; merchant cannot create or publish pages. |
| Navigation | 🔴 API-only | No dashboard UI. |
| Media | 🟡 Partial | Upload + preview + delete only; **no list endpoint/page** (page explicitly documents this); cannot browse previously uploaded assets. |
| Subscription | ✅ Implemented | Status + trial dates displayed in Settings; read-only. |
| Account/profile | 🟡 Partial | Email + role displayed; no profile editing, no password change (delegated to Supabase). |
| Store switching | 🔴 Missing | Multi-store resolution exists server-side; no UI. |
| Audit log | 🔴 Missing | API writes audit logs; no viewer. |

**Dashboard conclusion:** the operational core (products, orders, customers, media upload) is real
and production-quality. The **storefront customization surface (CMS/theme/navigation/logo) is the
biggest dashboard gap** for a real merchant.


---

# 6. Storefront Audit

Routes audited: home, products, products/[slug], categories, categories/[slug], cart, checkout,
orders/[orderId], pages/[pageSlug]. Plus `not-found.tsx`, shell, header, footer.

| Check | Result |
| --- | --- |
| Real data | ✅ verified live (§2). Only ACTIVE products/variants/categories, PUBLISHED pages exposed. |
| Loading states | ✅ skeletons/spinners on every route. |
| Error states | ✅ `StorefrontError` with retry; unknown slug → 404 (`not-found.tsx`). |
| Empty states | ✅ no-products / no-search-results / empty cart. |
| Mobile | ✅ responsive shell + mobile nav. |
| Desktop | ✅. |
| Arabic / RTL | ✅ i18n provider + `dir=rtl` + logical CSS properties; locale persisted pre-hydration (no flash). |
| English | ✅. |
| SEO | 🔴 none per store (see §21). |
| Accessibility | 🟡 Reasonable (aria-labels, radiogroup, role=search, alt text) but not audited with tools; no focus-trap tests for the mobile nav. |
| Performance | 🟡 Client-rendered pages; per-product media blob proxying through the API (no CDN); image requests cached only via a 1h header + an in-memory blob cache. |
| Broken links | ✅ nav maps to real routes; unrecognized destinations fall back to home. |
| Invalid slug behavior | ✅ 404 fail-closed (verified live). |
| Media | 🟠 Product images streamed through the API blob proxy (no `<img>` src URLs, no CDN, no responsive sizing, no `next/image`); logo via same proxy. |

**Storefront conclusion:** functionally complete and verified live. The gaps are SEO, media
delivery/CDN, and the missing production domain.


---

# 7. Product Audit

Lifecycle create → edit → variants → images → categories → price → inventory → publish →
unpublish → archive:

| Area | State | Notes |
| --- | --- | --- |
| Name/description/slug | ✅ | Slug auto-generated, `@@unique([storeId, slug])`, per-store unique. |
| SKU | ✅ | Per-store unique (`@@unique([storeId, sku])`, partial). |
| Price | ✅ | BigInt piastres, `>= 0` CHECK. |
| Compare-at price | ✅ collected | Stored on variant; **not displayed anywhere on the storefront** (no sale badge). |
| Variants | ✅ | Nested CRUD; archive; purchasable = product ACTIVE + variant ACTIVE + inventory available. |
| Variant options | 🟡 | No option model (e.g. Size/Color dimensions are not structured; variants are free-form names like "Black / Medium"). No option combos/auto-generation. |
| Images | 🟡 | `product_media` association exists and the storefront renders galleries, but the dashboard product page has **no image upload/attach UI** — merchant cannot attach images without API calls. |
| Categories | ✅ | Assign/remove on product detail; storefront category pages. |
| Product status | ✅ | DRAFT/ACTIVE/ARCHIVED with guarded transitions. |
| Stock | 🟡 | Inventory is per-variant, but no product-level stock view; "missing row = zero" is a fail-closed design. |
| Inventory movements | ✅ | Immutable append-only with on-hand-after snapshots. |
| Validation | ✅ | Whitelist DTOs; application + DB CHECKs. |
| Duplicate data | ✅ | Per-store slug/SKU/category-link uniques. |
| Empty states | ✅ | List + detail. |
| Search | ✅ | Name `contains` (case-insensitive) on both dashboard and storefront. |
| Filtering | ✅ | Status/category (dashboard). |
| Pagination | ✅ | Dashboard 20/page, storefront 12/page. |
| Bulk operations | 🔴 Missing | No bulk publish/archive/delete (recommendation — not required by docs). |

**What Shopify-like merchants would expect but is missing (recommendations, not facts):** structured
variant options, product image attach UI, compare-at pricing display, product type/vendor/tags,
bulk edit, duplicate product, product SEO fields (title/description/metadata), low-stock flag,
draft preview.


---

# 8. Inventory Audit

| Area | State | Notes |
| --- | --- | --- |
| Stock levels | ✅ | `on_hand` / `reserved`, CHECK `on_hand >= reserved`. |
| Variant inventory | ✅ | 1:1 inventory row per variant; missing row fails closed (never zero). |
| Adjustments | ✅ | `ADJUSTMENT`/`INITIAL_STOCK` movements with reason + on-hand-after. |
| Movements | ✅ | Append-only ledger. |
| Reservation | ✅ | Created at checkout inside the order transaction; guarded increments. |
| Checkout behavior | ✅ | Whole checkout in one transaction; failure rolls back everything. |
| Payment failure | ✅ | Webhook FAILED → reservations ACTIVE→RELEASED (guarded). |
| Payment success | ✅ | Webhook SUCCEEDED → reservations ACTIVE→CONSUMED, order CONFIRMED. |
| Order cancellation | ✅ | `CANCELLED` transition releases ACTIVE reservations (OrdersService). |
| Out-of-stock | ✅ | Storefront `available` derived; cart add fails closed with `INSUFFICIENT_INVENTORY` (verified live). |
| Overselling protection | ✅ | Atomic guarded `UPDATE ... WHERE on_hand - reserved >= qty` increments inside the checkout transaction. |
| Concurrent checkout | ✅ | The reservation primitive is an atomic conditional UPDATE; e2e covers concurrent reservation. |
| **Abandoned checkout** | 🔴 | **No sweep.** A customer who starts checkout and never pays leaves the PENDING order + ACTIVE reservation forever (the reservation has `expires_at`, but no job transitions ACTIVE→RELEASED on expiry; lazy evaluation only applies on cart access and the cart is COMPLETED at checkout). Sellable stock is permanently reduced. |
| Reservation expiry | 🔴 | Documented as a future operational job (Phase 19 report §15.5); **not implemented**. |

**Inventory conclusion:** the mechanics are safe (atomic, guarded, transactional), but the missing
reservation/cart expiry sweep is a real availability leak for a live merchant and should be treated
as a pilot-blocking operational job (a small scheduled task, not a schema change).


---

# 9. Cart / Checkout Audit

**Cart** (add → retrieve → update qty → remove → clear → checkout):

| Check | Result |
| --- | --- |
| Guest cart | ✅ server-generated opaque token, persisted per slug in localStorage. |
| Persistence | ✅ backend table (`carts`, `cart_items`) + localStorage token. |
| Product/variant availability | ✅ revalidated on every add/update (ACTIVE + inventory). |
| Quantity validation | ✅ positive int, DB CHECK, one line per variant (merge on add). |
| Inventory changes | ✅ availability rechecked at add/update; checkout revalidates again inside the transaction. |
| Invalid/deleted/archived product | ✅ fails closed (NOT_FOUND / CONFLICT). |
| Price changes | ✅ cart is display-only; checkout reloads authoritative prices (verified in `CheckoutService`). |
| Store isolation | ✅ cart lookup is store-scoped (guest token only selects within the resolved store) — verified in code + e2e. |
| Cart expiry | 🟠 Lazy transition ACTIVE→EXPIRED on access only; no sweep job. |

**Checkout** (customer data, address, order creation, validation, totals, inventory, payment,
errors, duplicates, refresh/back-nav, failed/pending/success):

| Check | Result |
| --- | --- |
| Customer data | ✅ name/phone/email validated; customer row created/resolved per store; email unique per store. |
| Address | ✅ shipping address snapshot copied into the order (never references reusable rows). |
| Shipping data | 🟡 Collects governorate/city/addressLine/building/apartment only — no postal code/country; shipping is always 0 (documented MVP). |
| Order creation | ✅ single transaction: validate → resolve customer → reserve → create PENDING order → snapshot items → link reservations → complete cart. |
| Validation | ✅ whitelist DTO + application rules. |
| Totals | ✅ server-computed from authoritative prices; `grand_total` consistency CHECK in DB. |
| Inventory | ✅ reserved atomically; insufficient → 409. |
| Payment | ✅ wired; blocked only by placeholder credentials. |
| Error handling | ✅ safe domain errors; full rollback. |
| Duplicate checkout | ✅ `Idempotency-Key` (partial unique per store) returns the original order. |
| Refresh / back-nav behavior | ✅ idempotent; refresh with the same key returns the same order; cart is completed so re-checkout of the same cart fails closed. |
| Failed payment | ✅ payment FAILED, order stays PENDING, reservations released, customer can retry with a new key. |
| Pending payment | ✅ PENDING/PROCESSING states; order confirmation polls. |
| Successful payment | ✅ webhook-driven (never the browser redirect). |

**Cart/checkout conclusion:** safe for real customers once payments are live. The gap is the
reservation-expiry job (abandoned checkouts) and the missing shipping fields/cost engine.


---

# 10. Payment Audit

**Paymob integration** (`apps/api/src/payments/`):

| Area | State |
| --- | --- |
| Payment initiation | ✅ Implemented: auth token → order register (`merchant_order_id` = payment UUID) → payment key → iframe URL. 10s timeout, fails closed with safe 409. |
| Payment attempt creation | ✅ PENDING attempt created in a tenant-bound transaction before provider call. |
| Payment status | ✅ PENDING → PROCESSING (on initiation) → SUCCEEDED/FAILED (webhook only). |
| Payment callback / webhook | ✅ `POST /webhooks/paymob`, `@Public()`, HMAC-verified, deduped, processed in one tenant-bound transaction. |
| HMAC validation | ✅ `verifyPaymobTransactionHmac` (HMAC-SHA512, `timingSafeEqual`, field concat per Paymob docs). ⚠️ **Explicitly unverified against a real Paymob callback** (code comment + no live account). |
| Idempotency | ✅ webhook dedup (`provider+provider_event_id` unique); guarded transitions; payment idempotency keys. |
| Duplicate webhook | ✅ safe no-op for PROCESSED; RECEIVED/ERROR re-processed safely. |
| Failed payment | ✅ payment/attempt FAILED, reservations released, order stays PENDING. |
| Pending payment | ✅ event processed without terminal transition; retry-safe. |
| Successful payment | ✅ payment/attempt SUCCEEDED, reservations CONSUMED, order PENDING→CONFIRMED, audit. |
| Order/payment sync | ✅ payment stores orderId; order references payments; amounts/currency from the order (never client). |
| Secret handling | ✅ env-only, never logged, provider fails closed when missing. |
| Frontend exposure | ✅ no payment secrets in the frontend; card data never touches the app (Paymob iframe). |
| Logging | ✅ status-only logs, no token/payload/secret. |

**Implemented and verified (by tests + code inspection):** the full state machine, webhook
processing, dedup, idempotency, guarded transitions, fail-closed provider behavior.

**Implemented but NOT live-tested:** the actual Paymob API round-trip (auth token → register →
payment key → iframe → real card → real callback → HMAC verification against a real signature).
`PAYMOB_*` are placeholders; the provider refuses to initiate. **No payment has ever been processed
in this environment.**


---

# 11. Order Management Audit

| Area | State |
| --- | --- |
| Order creation | ✅ checkout-owned, transactional, idempotent. |
| Order listing | ✅ dashboard list with search/filter/pagination; storefront order confirmation view. |
| Order details | ✅ merchant detail (items, address snapshot, customer, payments/attempts); customer confirmation. |
| Payment status | ✅ via payment view + storefront overlay. |
| Order status | ✅ PENDING/CONFIRMED/PROCESSING/SHIPPED/DELIVERED/CANCELLED with guarded transitions + audit. |
| Customer information | ✅ snapshot email/phone + customer link. |
| Product information | ✅ snapshots product/variant names, SKU, unit price, line total (historical integrity). |
| Inventory impact | ✅ reservations consume/release on payment success/failure/cancellation. |
| Order history | 🟡 Status timestamps (confirmedAt/cancelledAt) + audit log rows exist; no dedicated history timeline UI. |
| Cancellation | ✅ PENDING/CONFIRMED → CANCELLED releases reservations. |
| Refund foundation | 🔴 None. No refund model/endpoint; a paid order cannot be refunded (Paymob `is_capture`/`is_refunded` fields exist in the webhook mapping only for signature purposes). |
| Merchant visibility | ✅ dashboard list/detail + dashboard home. |
| Customer visibility | ✅ order confirmation page (unauth by design). |
| Missing fulfillment | 🟠 No shipping methods/rates/tracking numbers, no fulfillment workflow beyond status transitions, no packing/invoice, no email notifications. |

---

# 12. Customer Management Audit

| Area | State |
| --- | --- |
| Customer creation | ✅ at checkout (find-by-email per store or create). |
| Guest customer | ✅ `authUserId` nullable; guest checkout fully supported. |
| Customer profile | 🟡 No profile management UI (address book API exists but no dashboard UI). |
| Customer listing | ✅ search + pagination (20/page). |
| Customer details | ✅ details + orders (10/page). |
| Customer orders | ✅ list + link to order detail. |
| Search | ✅ list query `search` parameter. |
| Filtering | 🟡 search only; no status/date filters. |
| Pagination | ✅. |
| Tenant isolation | ✅ store-scoped repository (verified patterns + tests). |


---

# 13. CMS / Theme / Media Audit

**CMS** (pages/sections/navigation/theme):

| Check | Result |
| --- | --- |
| Pages CRUD (API) | ✅ `pages`, `page_sections`, publish/draft/archive, SEO title/description fields. |
| Sections (API) | ✅ section types + content JSON + sort order. |
| Navigation (API) | ✅ singleton get-or-create; PAGE/CATEGORY/DESTINATION items, shape validation. |
| Theme (API) | ✅ primary color + font family + logo reference (store-scoped media validation). |
| Merchant dashboard UI | 🔴 **None.** Pages/sections/navigation/logo are API-only. |
| Storefront rendering | ✅ Verified: `GET /storefront/theme` and `/storefront/navigation` return real rows; the shell applies `--sf-primary/--sf-primary-soft/--sf-font`; navigation items render in header/footer; PUBLISHED pages render sections in order. |
| Publish/unpublish behavior | ✅ only PUBLISHED pages exposed to the storefront (fail closed). |
| Draft behavior | ✅ DRAFT/ARCHIVED never returned. |
| Media in CMS | 🟡 logo reference supported; no upload UI in the dashboard for logo. |

**Media:**

| Check | Result |
| --- | --- |
| Upload | ✅ direct server upload (raw body), stores binary first then metadata row. |
| Download | ✅ storefront proxy streams store-scoped media (verified 404 for cross-tenant id). |
| Product images | 🟡 API association exists; no dashboard attach UI. |
| Store logo | 🟡 theme API accepts `logoMediaId`; no UI. |
| CMS images | 🟡 no CMS image UI. |
| Storage provider | ✅ Supabase Storage REST, service-role, fail-closed. |
| Tenant isolation | ✅ object keys `{storeId}/{mediaId}` + store-scoped DB lookup + proxy fail-closed. |
| Authorization | ✅ merchant endpoints authenticated; public proxy store-scoped by slug. |
| Public exposure | ✅ proxy only (no public bucket URLs); 404 for unknown/cross-tenant ids. |
| Deletion | ✅ reference-guard (product_media RESTRICT), then DB delete then best-effort storage delete. |
| Invalid media IDs | ✅ 404 (verified live). |
| Missing media | ✅ fails closed (NOT_FOUND / empty). |
| **Size limits / MIME allowlist** | 🔴 No upload size cap (whole body buffered in memory by `readRawBody`) and no MIME allowlist (any non-empty Content-Type accepted) — DoS/abuse vector for a live merchant account. |


---

# 14. Authentication Audit

| Check | Result |
| --- | --- |
| Signup | ✅ Supabase email/password; app never sees the password. |
| Login | ✅ `signInWithPassword`. |
| Logout | ✅ `supabase.auth.signOut()` + state reset. |
| Session persistence | ✅ Supabase-managed localStorage session. |
| Session restoration | ✅ `getSession()` + `onAuthStateChange` + `/auth/me` refresh; 401 retry with token refresh in the API client. |
| Supabase integration | ✅ real project URL + anon key (`eyJ...` present). |
| Email confirmation | ✅ handled on signup (UI + routing). |
| Password handling | ✅ passwords only passed to Supabase; never stored/logged by the app (verified: no password field in any DTO/repository; auth provider only verifies Bearer tokens). |
| Unauthorized access | ✅ 401 fail-closed (verified live). |
| Expired session | ✅ 401 → refresh once → re-request; otherwise 401. |
| Dashboard protection | ✅ `DashboardGate` (spinner → redirect). Client-side gate only; **server-side protection is the API guard chain** (authoritative). |
| Onboarding protection | ✅ onboarding page routes unauthenticated → /login. |
| Merchant/customer separation | ✅ merchant dashboard requires membership; storefront is public by design. |
| **Brute-force protection** | 🔴 None at the application level (Supabase may rate-limit its own auth endpoints, but the API has no throttle on any endpoint). |
| **Multi-store** | 🟡 server-side support exists; no UI selection. |

---

# 15. Tenant Isolation Audit — CRITICAL

**Guard chain (global):** `AuthGuard` → `TenantContextGuard` → `RolesGuard` → `SubscriptionAccessGuard`.
`TenantContextService.resolveForUser` resolves the store ONLY from an ACTIVE membership — a
client-supplied store id is only a lookup key and fails closed when no matching membership exists.

**Repository discipline:** every read/write is store-scoped:
- Catalog/cart/checkout/orders/customers/inventory repositories take `storeId` from the tenant
  context and filter on it (spot-checked across all modules).
- The only global lookup is `paymentRepository.findByGlobalId` used by the **HMAC-verified webhook**
  to resolve the payment from the provider's `merchant_order_id` (a UUID), with the tenant then set
  from the payment's own `store_id`. Legitimate use.
- Storefront surfaces resolve the store server-side (`StorefrontStoreResolver`, `X-Storefront-Slug`
  + Host subdomain), never from client input, and pass the resolved store id into every underlying
  service (CartService/CheckoutService/PaymentsService/ThemeService/NavigationService all accept an
  optional trusted storeId).

**Verified live:** unknown storefront slug → 404; cross-tenant media id → 404; no token → 401;
no-inventory cart → fail-closed error.

**Findings**

| Resource | Isolation |
| --- | --- |
| Users | ✅ platform-level; per-user rows only. |
| Stores | ✅ slug unique; membership-gated reads/writes. |
| Memberships | ✅ user-scoped lookups. |
| Products / variants / categories | ✅ store-scoped everywhere (verified in repositories). |
| Inventory / movements / reservations | ✅ store-scoped; guarded updates. |
| Orders | ✅ store-scoped; idempotency key per store. |
| Customers | ✅ store-scoped; email unique per store. |
| Cart | ✅ guest token selects within the resolved store only. |
| CMS / theme / navigation | ✅ store-scoped + get-or-create per store. |
| Media | ✅ store-prefixed keys + store-scoped DB + proxy fail-closed. |
| Payments | ✅ store-scoped except webhook global lookup (HMAC-gated). |
| Subscriptions | ✅ store-scoped. |
| **RLS enforcement** | 🟠 Policies exist in the migration but are **not enforced** for the app connection (owner role bypass). Application-level isolation is the only active control today. |

**Verdict:** no IDOR/cross-tenant leak was found in the application layer (code + tests + live
probes). The remaining risk is (a) RLS is not actually active (defense-in-depth), and (b) any
future repository added without a store filter would not be caught by the database.

---

# 16. API Audit

All modules audited: auth, identity/stores/onboarding, catalog, inventory, customer, cart,
checkout, orders, payments (incl. webhook), subscription, storefront, storefront-commerce, cms,
media, health.

| Dimension | Result |
| --- | --- |
| Endpoint completeness | ✅ matches docs/API-SPEC for implemented phases; no undocumented endpoints found. |
| Authentication | ✅ global guard; `@Public()` only on the documented public storefront/webhook/health surfaces. |
| Authorization | ✅ roles via membership; subscription write overlay. |
| Tenant isolation | ✅ store-scoped (see §15). |
| DTO validation | ✅ whitelist + forbidNonWhitelisted + transform; domain validation. |
| Error handling | ✅ centralized envelope `{error:{code,message,details}}`; no stack traces leaked (AllExceptionsFilter). |
| Status codes | ✅ 400/401/403/404/409 consistent. |
| Pagination | ✅ `{data,meta{page,limit,total,totalPages}}` on collections. |
| Filtering/sorting | ✅ status/search/category filters; orderBy createdAt desc on storefront. |
| Idempotency | ✅ checkout, payment initiation, webhook processing. |
| Logging | ✅ NestJS Logger; no sensitive data (verified in provider/webhook code). |
| Rate limiting | 🔴 **None anywhere** (API-SPEC §37 unimplemented). |
| Documentation | ✅ Swagger in non-prod; docs/API-SPEC.md draft with §46 open decisions unresolved. |

**All `@Public()` endpoints** (verified): `GET /storefront*` (read API), `GET/POST/PATCH/DELETE
/storefront/cart*`, `POST /storefront/checkout`, `POST /storefront/orders/:id/payments`,
`GET /storefront/orders/:id` + `/payment`, `GET /storefront/theme`, `/navigation`,
`GET /storefront/media/:id/content`, `POST /webhooks/paymob`, `GET /health`. Each was reviewed for
fail-closed behavior (§15).


---

# 17. Security Audit

| Check | Result |
| --- | --- |
| Auth bypass | ✅ none found; `@Public()` only where intended; token verified server-side via Supabase. |
| Authorization bypass | ✅ roles from membership; fail-closed guards. |
| IDOR | ✅ no unfiltered by-id lookups outside the HMAC-gated webhook path. |
| Tenant isolation | ✅ application-level solid (see §15). |
| SQL injection | ✅ Prisma ORM parameterization; raw SQL only in RLS binder with bound params. |
| XSS | ✅ React escaping; `dangerouslySetInnerHTML` used only for the static locale bootstrap script; storefront section renderers render text/values without `dangerouslySetInnerHTML`. |
| CSRF | 🟢 Low risk: Bearer-token auth + JSON content type; no cookie-based auth to the API. |
| CORS | ✅ allowlist from `CORS_ORIGINS`; credentials enabled. |
| Rate limiting | 🔴 none. |
| Brute-force protection | 🔴 none at the API; relies on Supabase's own controls. |
| Input validation | ✅ strict DTOs + DB CHECKs. |
| File upload security | 🔴 no size limit, no MIME allowlist, raw body buffered in memory; no scanning. |
| Media exposure | ✅ store-scoped proxy only; verified live. |
| Secrets in frontend | ✅ none (only anon Supabase key + API base URL, which are public-by-design). |
| Environment variables | ✅ `.env` gitignored; `.env.example` placeholders only. |
| Payment secrets | ✅ env-only; never logged; fail-closed. |
| Webhook validation | ✅ HMAC + dedup + tenant-from-payment. Unverified against real Paymob callback. |
| Logging of sensitive data | ✅ no tokens/secrets/passwords logged (code inspection). |
| Error messages | ✅ safe envelopes; provider details limited to a safe 500-char message. |
| **Security headers** | 🔴 no Helmet/CSP on the API; storefront pages served by Next.js with default headers. |
| **App-level body limits** | 🟡 NestJS default JSON body limit (100kb) protects JSON endpoints; the media upload bypasses it by design (raw body) with no cap. |

---

# 18. Database Audit

Schema: 28 tables, one initial migration (`20260812000000_init`).

| Check | Result |
| --- | --- |
| Relationships/FKs | ✅ composite tenant-safe FKs `(store_id, parent_id) → (store_id, id)`; `onDelete` policies deliberate (Restrict/SetNull/Cascade). |
| Unique constraints | ✅ slug, SKU, email per store, order number, membership (store,user), cart item (cart,variant), webhook (provider,event), partial uniques (owner, guest token, idempotency keys, provider reference). |
| Indexes | ✅ tenant composite indexes on all hot paths (store_id+status, store_id+created_at DESC, store_id+status+expires_at for carts/reservations, payment event processing-status partial). |
| Cascades | ✅ product→variants/order items/media links; order→items/payments; cart→items. |
| Nullable fields | ✅ deliberate (customer/auth/guest/optional media). |
| Status fields | ✅ enums with guarded application transitions + CHECKs. |
| Monetary fields | ✅ BIGINT minor units with `>= 0` CHECKs and grand-total consistency CHECK. |
| Timestamps | ✅ timestamptz; immutable tables created_at only. |
| Soft deletion | ✅ status enums (ARCHIVED/CANCELLED/EXPIRED) rather than deletes; media delete is physical (documented). |
| Data integrity | ✅ CHECK constraints incl. `on_hand >= reserved`, `quantity > 0`, cart identity, reservation context, grand total consistency. |
| **Live-state divergence** | 🟠 The existing store has **no subscription row** (0 in DB) although the model says every store gets a TRIAL. Handled gracefully by code (missing → TRIAL), but the documented invariant is violated in the live DB. Pre-Phase-14 stores were never backfilled. |
| **Live-state residue** | 🟡 Live DB contains 65 products / 105 variants / 38 categories created by Playwright E2E runs (names like "E2E Product 135378"). A pilot must start from a clean or curated catalog. |
| **RLS effective enforcement** | 🟠 Enabled in schema; not enforced for the app connection (see §15). |
| **Foreign-key guard on `product_media.variantId`** | 🟡 FK to `id` only (not composite) — a cross-store variant id could theoretically satisfy it, but the application always writes within the store transaction; minor. |


---

# 19. Performance Audit

Observed (no profiling performed — flagged only where obvious):

| Risk | Severity | Evidence |
| --- | --- | --- |
| Dashboard revenue = N sequential paginated calls (cap 50×100) | 🟡 | `dashboard/page.tsx fetchTotalRevenue` — O(totalOrders/100) round trips per load. |
| Dashboard home fires 6 collection calls per load | 🟡 | counts via separate `listProducts` calls. |
| Storefront images via API blob proxy, one fetch per image, cached in an unbounded Map | 🟡 | `storefrontMediaUrlForSlug` blob cache never evicts; no CDN; blob URLs are per-session. |
| Client-rendered storefront (no RSC/SSR data) | 🟡 | every storefront page fetches store/theme/nav + page data client-side → slow first paint + no SSR SEO. |
| `count` + `findMany` per storefront page (Promise.all) | 🟢 | acceptable at MVP scale; indexed. |
| Product list `contains` search | 🟢 | no pg_trgm; fine for small catalogs. |
| No Redis/caching layer | 🟢 | documented decision; fine at pilot scale. |
| Media upload buffers whole request in memory | 🟡 | `readRawBody`; large files → memory pressure (no cap). |

No N+1 patterns found in the core storefront/order/customer queries (includes are used).

---

# 20. UX Audit

**Merchant:** Can a non-technical merchant…?

| Question | Verdict |
| --- | --- |
| Where to start? | ✅ marketing CTA → signup → onboarding checklist. |
| Create products? | ✅ guided, but inventory discovery is poor (hidden modal). |
| Configure the store? | 🟠 Name only in the dashboard; no CMS/theme/navigation/logo UI. |
| Publish? | ✅ obvious publish/unpublish controls + confirmations. |
| View the store? | ✅ "View Store" in home/sidebar/settings/onboarding. |
| See orders? | ✅ orders list/detail. |
| Know if something is broken? | 🔴 No dashboard-level alerting/status; subscription expiry only blocks writes silently (403 per call); no banner. |

**Customer:** Can a normal customer…?

| Question | Verdict |
| --- | --- |
| Understand the store? | ✅ real branding, categories, products. |
| Browse products? | ✅ search + pagination. |
| Choose variants? | ✅ radio group, disabled out-of-stock, per-variant price. |
| Add to cart? | ✅ with toasts and cart count. |
| Checkout? | ✅ form validation + order placed + payment step. |
| Pay? | 🔴 blocked by Paymob placeholders today; UI is correct (iframe). |
| Understand payment status? | ✅ order confirmation shows payment status + failure messages, polls. |
| Understand order status? | ✅ localized status badges. |

**Cross-cutting UX:** mobile ✅, desktop ✅, AR ✅, EN ✅, RTL ✅, forms ✅ (inline field errors),
empty states ✅, error states ✅, success states ✅. Accessibility is reasonable but not tool-audited
(no axe tests); focus management in modals/mobile nav untested; some interactive elements are
text-glyphs.


---

# 21. SEO Audit

| Check | Result |
| --- | --- |
| Per-store title | 🔴 none — storefront pages inherit the app template ("… | Ziad E-commerce"). |
| Per-store description | 🔴 none. |
| Canonical URLs | 🔴 none. |
| Open Graph | 🔴 marketing pages only; none for storefronts/products. |
| Twitter/social metadata | 🔴 none. |
| Product metadata | 🔴 none (title/description/OG per product). |
| Sitemap | 🔴 none (`app/sitemap.ts` absent). |
| robots.txt | 🔴 none. |
| Structured data (Product/Store) | 🔴 none. |
| Indexability | 🟠 storefront pages are `'use client'` and data-loaded client-side → crawlers see empty shells. |
| Slug strategy | ✅ URL-safe unique per-store slugs for stores/products/categories/pages. |

No SEO was implemented in this phase (per the audit mandate); this section is the gap list.

---

# 22. Production Infrastructure Audit

| Requirement | State |
| --- | --- |
| Production database | 🟠 Live Supabase PostgreSQL is real and healthy (verified). RLS not enforced for the app connection (§15). |
| Supabase | ✅ real project configured. |
| Storage | ✅ configured (bucket `media`); no objects uploaded yet in live DB; **no live upload test performed in this audit** (would create data). |
| Redis | 🟢 not used (documented decision). |
| API deployment | 🔴 no deployment config/CI; `nest start:prod` from `dist` only. |
| Next.js deployment | 🔴 no deployment config/CI; `next start` only. |
| Environment variables | ✅ root `.env` + `apps/web/.env`; documented. |
| Domain / SSL | 🔴 no production domain configured. |
| **Wildcard subdomains** | 🔴 **`STOREFRONT_DOMAIN=platform-domain.com` (placeholder), no DNS, no reverse proxy.** The resolver supports the host-subdomain mechanism and the storefront is prepared, but nothing is deployed. |
| CDN | 🔴 none (media proxied through the API). |
| Logs | 🟡 NestJS console logs only; no structured logging/aggregation. |
| Monitoring | 🔴 none. |
| Backups | 🔴 none configured (Supabase platform default only). |
| Error tracking | 🔴 none (no Sentry/APM). |
| Database migrations | ✅ single migration; `prisma migrate deploy` works; migration applied to the live DB. |
| Health checks | ✅ `GET /health` with DB check (verified). No readiness for storage/paymob/subscription. |
| Deployment process | 🔴 no documented runbook/CI/CD. |
| **Paymob production credentials** | 🔴 **Placeholders** (`YOUR_..._KEY`-style, verified). Payment initiation fails closed with 409. |
| Rate limiting | 🔴 not implemented (deployment-time TODO in Phase 19 report). |
| Body size / resource limits | 🟡 no media upload cap; no reverse-proxy body limits documented. |


---

# 23. Subscription / SaaS Audit

| Area | State |
| --- | --- |
| Trial behavior | ✅ TRIAL created with every new store (onboarding), configurable `SUBSCRIPTION_TRIAL_DAYS`, lazy TRIAL→EXPIRED on access. |
| Subscription status | ✅ TRIAL / ACTIVE / EXPIRED state machine with guarded transitions; live DB has 0 rows (pre-Phase-14 store never backfilled — handled as TRIAL by code). |
| Plan model | 🔴 none (no plans/pricing model). |
| Limits | 🔴 none (no product/order/storage limits). |
| Feature gating | 🟡 only the EXPIRED write-block + storefront disable. |
| Expiration | ✅ lazy transition; **no sweep job**; dashboard read-only on EXPIRED; storefront 404 on EXPIRED. |
| Upgrade / downgrade | 🔴 none. |
| Cancellation | 🔴 none. |
| Billing integration | 🔴 none — **no billing, no recurring charges, no invoices** (documented as future; the Phase 14 report says "MVP billing/payment model deferred"). |
| What must be built before charging merchants | A plan catalog, checkout/payment for subscription billing, entitlement/limits enforcement, upgrade/downgrade/cancel flows, and the expiry sweep. |

**Verdict:** the subscription feature is a **free-trial access gate**, not a SaaS billing system.
This is acceptable for the pilot (give merchants a free trial) but the product cannot charge
merchants until the billing layer is built.

---

# 24. Testing Audit

| Category | Count | Status |
| --- | --- | --- |
| API unit tests | 891 (118 suites) | ✅ PASS (executed) |
| Web unit tests | 91 (19 suites) | ✅ PASS (executed) |
| API E2E (in-memory/stubbed Prisma + real guard chain + real services) | 423 | ✅ PASS (executed) |
| API E2E RLS/database suites | 262 (14 suites) | ⚠️ SKIPPED/BLOCKED — require a local PostgreSQL with the RLS policy set (convention; not faked) |
| Web E2E (Playwright) | 6 spec files | ⚠️ BLOCKED — Playwright browsers not installed, web server not running, requires a merchant session + real Paymob for the payment leg |
| Live DB verification | — | ✅ executed in this audit (read-only probes, removed afterwards) |
| Payment live E2E | 1 test (storefront spec) | ❌ SKIPPED by design — `test.skip(!paymobConfigured())` |
| Tenant isolation tests | Present in e2e suites (cross-store guards) | ✅ PASS at app layer; DB-level RLS never executed |

**Coverage gaps (critical journeys NOT covered end-to-end):**
- The full live payment journey (initiate → Paymob iframe → real card → real callback → HMAC → order
  CONFIRMED). Blocked by credentials.
- Web E2E: admin.spec, modules.spec, lifecycle-and-auth.spec, onboarding.spec, storefront.spec,
  helpers — never executed here.
- Reservation/cart expiry sweeps — no code exists to test.
- Real-RLS tenant isolation at the DB layer.
- Multi-store selection behavior in the UI.

Per the audit mandate, **no skipped test was counted as passed.**


---

# 25. Master Gap Matrix

| Area | Current State | Evidence | Severity | Required Before Pilot? | Recommended Next Phase |
| --- | --- | --- | --- | --- | --- |
| Paymob Live credentials | Blocked | `.env` placeholders; provider fails closed 409; web e2e skipped | 🔴 | Yes | Payment Production (21) |
| Wildcard storefront domains | Missing | `STOREFRONT_DOMAIN` placeholder; no DNS/proxy | 🔴 | Yes | Production Deployment (27) |
| Rate limiting | Missing | No ThrottlerModule anywhere; API-SPEC §37 TODO | 🔴 | Yes | Production Deployment (21) |
| Reservation/cart expiry sweep | Missing | No periodic job; PENDING orders hold reservations forever | 🔴 | Yes | Critical Production Fixes (21) |
| RLS enforced on app connection | Not enforced | App connects as owner; policies bypassed | 🟠 | Yes (after enabling) | Critical Production Fixes (21) |
| Media upload size/MIME limits | Missing | `readRawBody` no cap; no allowlist | 🟠 | Yes | Critical Production Fixes (21) |
| CMS/theme/navigation dashboard UI | Missing (API-only) | No dashboard routes for pages/navigation/theme | 🟠 | Yes (store customization) | Store Customization (22) |
| First-product inventory guidance | Gap | Onboarding creates unpurchasable product; all live ACTIVE variants have NULL inventory | 🟠 | Yes | Product Management (23) |
| Product image attach UI | Missing | API-only `product_media` | 🟠 | Yes | Product Management (23) |
| Web E2E execution | Blocked | Playwright not installed; server not running | 🟠 | Yes | Critical Production Fixes (21) |
| RLS/database E2E execution | Skipped | 262 tests blocked on local RLS Postgres | 🟠 | Yes | Critical Production Fixes (21) |
| Paymob HMAC live verification | Unverified | Code comment: must verify against real callback | 🟠 | Yes | Payment Production (21) |
| Refunds | Missing | No model/endpoint | 🟠 | No (post-pilot) | Orders & Fulfillment (24) |
| Shipping cost engine / methods | Missing | shipping_total always 0 | 🟠 | No | Shipping (25) |
| Customer accounts / order history | Missing | Guest-only by design | 🟡 | No | Customer Experience |
| SEO (metadata/sitemap/robots/structured data) | Missing | Static title only | 🟡 | No | Store Customization (22) |
| Compare-at price display | Missing | Stored, never rendered | 🟡 | No | Product Management (23) |
| Bulk product operations | Missing | None | 🟡 | No | Product Management (23) |
| Media library list | Missing | Upload-only page | 🟡 | No | Product Management (23) |
| Multi-store switcher UI | Missing | API supports, UI does not | 🟡 | No | Merchant Experience |
| Structured variant options | Missing | Free-form variant names | 🟡 | No | Product Management (23) |
| Subscription plan/billing | Missing | Trial gate only | 🟡 | No | SaaS Billing (26) |
| Dashboard alerting/banners | Missing | No "storefront is down/expired" banner | 🟡 | No | Merchant Experience |
| Analytics | Missing | Dashboard home has basic counts; no module | 🟡 | No | Analytics (28) |
| Error tracking/monitoring/logging | Missing | Console logs only | 🟡 | No | Production Deployment (27) |
| CI/CD + deployment runbook | Missing | No config | 🟡 | No | Production Deployment (27) |
| Backups / DB ops | Not configured | Supabase defaults only | 🟡 | No | Production Deployment (27) |
| README stale (Phase 0) | Documentation | README says "no business features implemented" | 🟢 | No | — |
| Stale provider comments | Documentation | Storage/Auth providers claim credentials absent | 🟢 | No | — |
| Live DB hygiene | Data | 65 E2E products / 0 subscriptions / 0 orders | 🟢 | No (clean for pilot) | — |
| Audit-log viewer | Missing | API writes, no UI | 🟢 | No | Merchant Experience |
| Cart expiry sweep (complement of reservation) | Missing | Lazy only | 🟢 | No (job covers it) | Critical Production Fixes (21) |


---

# 26. Critical Risks (Top 10)

1. 🔴 **No live payment possible** — placeholder Paymob credentials; the entire revenue path is
   unverified. If shipped as-is, every real customer order fails at payment.
2. 🔴 **Wildcard storefront domains absent** — merchants have no production storefront URL; the
   storefront only works under the dev `/store/[slug]` path.
3. 🔴 **Unbounded public endpoints** — no rate limiting on cart/checkout/payment/storefront;
   carding/abuse/brute-force risk once live.
4. 🔴 **Abandoned orders reserve stock forever** — no reservation/cart expiry sweep; a live store's
   sellable inventory drains on every abandoned checkout.
5. 🟠 **RLS is decorative in production** — the app connection bypasses it; tenant isolation rests
   solely on repository discipline. One future unfiltered query = cross-tenant leak.
6. 🟠 **Webhook HMAC never validated against a real Paymob callback** — signature algorithm may not
   match the live provider exactly; a broken signature check would reject all real webhooks.
7. 🟠 **Media upload is unbounded** — memory DoS and storage abuse by any authenticated merchant.
8. 🟠 **CMS/theme/navigation are invisible to merchants** — first merchants cannot customize their
   storefront without API skills; onboarding's "configure" step is name-only.
9. 🟠 **First-product flow produces unpurchasable products** — no inventory set during onboarding;
   the storefront shows every new product as out of stock (verified live).
10. 🟠 **PII exposure on unauthenticated order confirmation** — anyone with the order UUID can view
    customer name/phone/email/address. Acceptable for a guest MVP, but must be acknowledged and
    re-evaluated (short-lived signed links or customer tokens recommended before wider use).

---

# 27. Recommended Fixes

Prioritized by the audit's severity ordering (security → data integrity → payment correctness →
tenant isolation → core merchant/customer functionality → production infra → UX → analytics).

**Before pilot (blockers):**
1. Configure **real Paymob credentials** and run the live payment E2E (initiate → iframe → card →
   callback → HMAC → order CONFIRMED). Verify the HMAC field list against a real callback.
2. Deploy **wildcard subdomains** (`{slug}.yourdomain.com`) + `STOREFRONT_DOMAIN` + SSL.
3. Add **rate limiting** on public storefront/checkout/payment endpoints (API-SPEC §37).
4. Implement the **reservation/cart expiry sweep** (scheduled job that releases EXPIRED ACTIVE
   reservations and completes/expires abandoned carts). Small, additive, no schema change.
5. Enforce **RLS for the app connection** (FORCE ROW LEVEL SECURITY + run queries as a role that
   does not own the tables, or add an application-level write-gate that sets the tenant GUC on
   every request — not only transactions) so the DB is a real backstop. Validate with a local RLS
   Postgres and the 262 blocked e2e tests.
6. Add **media upload limits** (max size + MIME allowlist) at the controller/provider boundary.
7. Run the **web Playwright suite** against a full local stack (install browsers, start API+web,
   use the real merchant session).
8. **Seed inventory for pilot products** (or add an onboarding inventory step / callout in the
   first-product flow).

**Post-pilot (high value):**
9. CMS/theme/navigation/logo **dashboard UI** (pages + sections + navigation + theme editor).
10. **Product image attach UI** and a media library list endpoint/page.
11. **SEO** per store/product (title/description/OG/canonical), sitemap, robots, and consider SSR
    for storefront pages.
12. **Refund flow** (foundation: capture/refund models + Paymob refund call + merchant UI).
13. **Shipping methods/rates** and fulfillment (tracking, packing slip).
14. **Customer accounts + order history** and authenticated order lookup.
15. **SaaS billing** (plans, limits, upgrade/downgrade/cancel) only when ready to charge.

No fixes were implemented in this phase (audit mandate).


---

# 28. Proposed Next Phases

Generated from the actual findings (not a fixed template):

```text
Phase 21 — Critical Production Fixes
    Paymob live credentials + live payment E2E + HMAC verification
    Wildcard subdomain deployment + SSL + STOREFRONT_DOMAIN
    Rate limiting on public endpoints
    Reservation/cart expiry sweep job
    RLS enforcement + local RLS e2e execution (262 tests)
    Media upload size/MIME limits
    Web E2E execution (Playwright) + CI
    Onboarding inventory guidance / inventory seeding

Phase 22 — Store Customization
    Dashboard CMS: pages + sections + publish/unpublish
    Dashboard theme editor (colors, font, logo upload)
    Dashboard navigation editor
    Storefront SEO metadata + sitemap + robots
    Media library (list + attach product images)

Phase 23 — Product Management
    Product image attach UI
    Compare-at price display (sale badges)
    Structured variant options (Size/Color) + option-driven variant creation
    Bulk publish/archive/duplicate
    Draft preview

Phase 24 — Orders & Fulfillment
    Refund foundation + Paymob refund
    Fulfillment workflow (packing, tracking numbers, shipping carriers)
    Order history timeline UI
    Merchant notifications (email)

Phase 25 — Shipping
    Shipping methods + rates + zones
    Checkout shipping selection + tax foundation
    COD path (documented MVP future)

Phase 26 — SaaS Billing
    Plan catalog + limits + feature gating
    Subscription checkout/payment + invoices
    Upgrade/downgrade/cancel flows
    Billing webhooks + expiry sweep

Phase 27 — Production Deployment
    API + web deployment (containers/CI), CDN for storefront media
    Logging aggregation, monitoring, alerting, error tracking
    Backups + restore drills
    Security headers (Helmet/CSP)
    Load/soak test

Phase 28 — Analytics
    Sales/orders/customers/product dashboards, sales-over-time
    Best sellers, conversion funnel

Phase 29 — Merchant Experience & Social
    Store switching UI, dashboard banners/alerting
    Customer accounts + order history
    Notifications (WhatsApp/SMS), Meta catalog sync (roadmap phases)

Phase 30 — First Merchant Pilot
    Curated catalog + seeded inventory, monitoring, success criteria
```


---

# 29. Recommended MVP / Pilot Scope

For the **first controlled merchant pilot** (after Phase 21):

- **In scope:** signup → onboarding → products (with inventory set explicitly) → storefront
  browsing → guest cart → checkout → Paymob card payment → order confirmation → merchant orders
  dashboard; subscription trial gate; EN/AR.
- **Explicitly out of scope for the pilot:** CMS/theme/navigation UI (API-configurable only),
  refunds, shipping costs, customer accounts, analytics, billing.
- **Operational prerequisites:** one real Paymob account, one Supabase project (already present),
  one production domain with wildcard subdomains, the expiry sweep job running, rate limits enabled,
  a clean pilot store with seeded inventory, monitoring + rollback plan.
- **Pilot size:** 2–5 merchants, a curated product catalog, and a defined feedback loop.

---

# 30. Final Go / No-Go Assessment

## GO WITH CONDITIONS

The product **can** be piloted, but **only after** the following critical conditions are completed
and verified:

1. **Real Paymob credentials configured** and the **live payment E2E passed** (including webhook
   HMAC verification against a real Paymob callback).
2. **Wildcard storefront domains deployed** with `STOREFRONT_DOMAIN` set and SSL in place.
3. **Rate limiting enabled** on the public storefront/checkout/payment endpoints.
4. **Reservation/cart expiry sweep job** running (abandoned orders must not hold stock forever).
5. **RLS enforced for the application connection** and the blocked RLS e2e suites executed against
   a real local PostgreSQL (or an explicit, documented decision to rely on application-level
   isolation for the pilot).
6. **Media upload limits** (size + MIME) in place.
7. **Web Playwright E2E suite executed** against the full local stack with a real merchant session.
8. **Pilot data hygiene:** clean store, seeded inventory, no E2E residue.

**Basis:** every code-level claim in the Phase 19 report was verified in source; typecheck, lint,
unit tests, builds, API E2E (423) and live API/database probes all PASS; tenant isolation,
fail-closed behavior and the real-data storefront were confirmed live. The blockers are
**environmental/operational** (credentials, domains, jobs, limits, RLS enforcement), not
architectural. The merchant-to-customer journey is real and will work once payments are live.

**If the conditions above are not met, the honest verdict for "tomorrow" is NO-GO for a real
payment-taking merchant** — customers could browse, cart and place orders, but could not pay, and
abandoned orders would silently consume inventory.

