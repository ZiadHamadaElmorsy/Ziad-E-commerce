# IMPLEMENTATION — PHASE 22 — PAYMENTS, CARD CHECKOUT & WHATSAPP ORDERING

**Status:** COMPLETE — implemented, validated. Live external-dependency verification is
reported separately and never faked (real Paymob test card payment and real web E2E are
**BLOCKED** by external configuration — see §17/§20).
**Verdict:** **GO WITH CONDITIONS** — see §20.

---

## 1. Objective

Complete and verify the production purchase journey: online card payment through Paymob
(Intention API + Unified Checkout) with HMAC-verified webhooks, plus a store-scoped WhatsApp
ordering fallback that creates REAL orders. Preserve every Phase 21 fix (rate limiting,
reservation expiry, media validation, host-based storefront resolution, security headers,
webhook idempotency, tenant resolution, checkout revalidation) and do not introduce duplicate
payment/order/cart systems.

---

## 2. Paymob architecture chosen — Intention API + Unified Checkout (Option A)

### Why Option A

- The project's legacy provider flow required `PAYMOB_IFRAME_ID`
  (`/api/acceptance/iframes/{id}`). The merchant's Paymob dashboard **Iframes page fails to
  load**, so a real iframe id is unavailable and Option C is blocked.
- Option A (Intention API + Unified Checkout) and Option B (Intention API + Pixel) both need
  the Paymob **public key** (a non-secret identifier). Option A uses the provider-hosted
  Unified Checkout page, which is the current, supported, simplest web flow and needs no
  client-side JS library — so **Option A** was selected.
- `PAYMOB_IFRAME_ID` is **no longer required** (kept only for backwards compatibility and the
  startup diagnostic).

### Flow

```text
POST {PAYMOB_API_URL}/v1/intention
  api_key, amount (minor units), currency, payment_methods=[integration id],
  billing_data, items, special_reference=payment UUID,
  notification_url (PAYMOB_WEBHOOK_URL), redirect_url (storefront origin),
  expires_in
  -> { id, client_secret }

Checkout URL: {PAYMOB_API_URL}/unifiedcheckout/?public_key={PAYMOB_PUBLIC_KEY}&client_secret=...
```

- `providerReference` = the Intention `id` (fallback `client_secret`). The `client_secret` is a
  session credential carried ONLY inside the returned `providerCheckoutUrl` — never persisted,
  never logged, never exposed through any other field.
- Webhook resolution is unchanged and tenant-safe: Paymob echoes `special_reference` (= the
  payment UUID) as `order.merchant_order_id`, and the webhook derives the tenant from the
  payment's own `store_id`.

---

## 3. Environment variables

```env
PAYMOB_API_URL=            # default https://accept.paymob.com
PAYMOB_API_KEY=            # secret — required for /v1/intention
PAYMOB_INTEGRATION_ID=     # card integration id (test: 4624759)
PAYMOB_PUBLIC_KEY=         # public key — required for the Unified Checkout URL
PAYMOB_HMAC_SECRET=        # secret — required for webhook HMAC verification
PAYMOB_IFRAME_ID=          # OPTIONAL / legacy — NOT required anymore
PAYMOB_WEBHOOK_URL=        # optional full webhook URL sent as notification_url
```

All values are optional at boot; the provider FAILS CLOSED at call time when the credentials
needed for an operation are missing. Secrets are environment-only and never committed,
logged, exposed to the frontend or included in tests/screenshots.

---

## 4. Card payment flow (customer)

1. Storefront → Product → Variant → Cart → Checkout form.
2. `POST /storefront/checkout` revalidates store/product/variant/price/inventory/customer/
   address server-side, reserves inventory with a bounded TTL and creates the PENDING order

---

## 6. Payment state machine (preserved)

`PENDING → PROCESSING → SUCCEEDED | FAILED` (terminal). Guarded conditional updates
(`WHERE status = from`) make retries/duplicates idempotent; terminal states never move
backwards. Order status is a separate machine (`PENDING → CONFIRMED → PROCESSING → SHIPPED →
DELIVERED`, cancellation from PENDING/CONFIRMED).

---

## 7. Inventory interaction

- Checkout reserves with `RESERVATION_TTL_MS` (Phase 21 sweep releases expired ACTIVE
  reservations idempotently).
- Payment success consumes (webhook); payment failure / order cancellation releases.
- Duplicate webhooks never double-consume (guarded transitions).
- **WhatsApp orders:** reservations are created at checkout; the merchant's manual
  confirmation (`PENDING → CONFIRMED`) is the commitment point — the Orders service consumes
  the order's ACTIVE reservations in the same transaction, so a confirmed WhatsApp order never
  loses its stock to the expiry sweep. Cancellation releases them.

---

## 8. WhatsApp merchant configuration

Stored in the **existing** `store_settings` JSONB table (key `whatsapp`) — no new table, no new
tenant model. Tenant-scoped merchant API:

```text
GET  /api/v1/stores/current/settings/whatsapp
PUT  /api/v1/stores/current/settings/whatsapp
  { "whatsapp": { "enabled": true, "phoneNumber": "+201012345678", "label": "..." } }
```

- Phone is normalized to E.164 digits and validated (enabled requires a valid number).
- The store id ALWAYS comes from the trusted tenant context (membership → store); a client
  never supplies a store id → Merchant A can never read/modify Merchant B's number.
- Public storefront config (`GET /storefront`) exposes `payments.{payOnline, whatsapp}` —
  the WhatsApp number is the merchant's public business contact (needed for the contact CTA).

---

## 9. WhatsApp checkout flow

```text
POST /api/v1/storefront/orders/whatsapp
  { customer, shippingAddress, orderId?, lang? }   + Idempotency-Key
```

1. Resolve the store server-side (StorefrontStoreResolver — never client input).
2. Fail closed (409) when WhatsApp is disabled or the number is invalid.
3. If `orderId` is given, REUSE that store-scoped PENDING order (transition channel to
   WHATSAPP; blocked if it has an active online payment) — no duplicate order.
4. Otherwise create a REAL order through the existing checkout pipeline (channel = WHATSAPP),
   revalidating everything server-side.
5. No Payment record is created; the order stays `PENDING` (pending manual confirmation),
   unpaid.
6. Build the wa.me URL with a URL-encoded order message (order number, items, totals,
   customer contact, address — EN/AR).
7. Return `{ order, whatsappUrl }`; the frontend opens WhatsApp.

The WhatsApp message is built server-side from purchase-time snapshots only — no secrets,
internal ids or auth data.

---

## 10. WhatsApp order lifecycle

- Channel stored on `orders.channel` (`ONLINE_PAYMENT | WHATSAPP`, default ONLINE_PAYMENT) —
  the ONE justified schema change (orders had no metadata column; the channel must be
  queryable/displayed). Backwards-compatible migration with a default.
- The merchant processes the WhatsApp order through the NORMAL Orders lifecycle (Confirm →
  Processing → Shipped → Delivered, or Cancel). No second order-management UI.
- Merchant dashboard shows **Payment channel** (Online Payment / WhatsApp) in the list and

---

## 13. Security

Preserved: rate limiting, security headers, media limits/MIME validation, path-traversal
guards, host resolution, input validation (forbidNonWhitelisted), webhook HMAC + idempotency,
fail-closed payment configuration. New in this phase: payment availability gate on public
checkout, guarded channel transitions, WhatsApp phone validation, order lookup by UUID
(unguessable — not trivially guessable), no secrets in the WhatsApp message or API responses.

---

## 14. Schema changes

One migration: `20260815000000_whatsapp_orders` — `CREATE TYPE order_channel` +
`orders.channel order_channel NOT NULL DEFAULT 'ONLINE_PAYMENT'` (backwards compatible).
Justification: the acquisition/payment channel must be queryable and displayed; `orders` had
no metadata column. No other schema changes; WhatsApp config uses the existing
`store_settings` JSONB.

---

## 15. Files changed / added

### API
- `prisma/schema.prisma`, `prisma/migrations/20260815000000_whatsapp_orders/`
- `src/config/configuration.ts`, `src/config/payment-config.ts`, `.env.example`
- `src/payments/providers/paymob/paymob-payment-provider.ts` (+ spec) — Intention + Unified Checkout
- `src/payments/providers/payment-provider.ts` (returnUrl), `src/payments/services/payments.service.ts`
  (`returnUrl` option, `hasActivePayment`)
- `src/store-settings/` (NEW) — domain `whatsapp-config`, DTO, repository, service, controller, module + specs
- `src/whatsapp/` (NEW) — domain `whatsapp-message`, `whatsapp-url`, DTO, service, module + specs
- `src/checkout/` — `channel` param on createCheckout, `CreateOrderInput.channel`, `CheckoutView.channel`
- `src/orders/` — `OrderChannel` on views, `transitionChannel`, WhatsApp-confirm reservation consumption
- `src/storefront/` — public store view `payments` (payOnline + whatsapp), types/spec updates
- `src/storefront-commerce/` — checkout payment-availability gate, `POST orders/whatsapp`,
  returnUrl on payment initiation
- `src/app.module.ts` — register StoreSettingsModule + WhatsappModule

### Web
- `lib/i18n/translations.ts` (EN + AR keys), `lib/storefront/types.ts`, `lib/api/types.ts`
- `lib/api/store.ts` (WhatsApp settings), `lib/api/cart.ts` (`orderViaWhatsApp`)
- `app/store/[slug]/checkout/page.tsx` (payment methods + fallback + WhatsApp confirmation)
- `app/store/[slug]/orders/[orderId]/page.tsx` (channel + unpaid state)
- `components/storefront/StorefrontHeader.tsx` (WhatsApp contact CTA), `storefront.css`
- `app/dashboard/settings/page.tsx` (WhatsApp settings card)
- `app/dashboard/orders/page.tsx` + `[orderId]/page.tsx` (channel display)

---

## 17. E2E / live validation results

### API E2E (stubbed Prisma, no external calls) — PASS
Full suite: 436 passed, 264 skipped (pre-existing RLS/database suites that require a local
PostgreSQL + RLS policy set), 0 failed.

### Real web E2E (Playwright, live stack: API :4000 + web :3000 + real Supabase) — RUN
Executed with a real merchant session (real Supabase). Result:

| Test | Result |
| --- | --- |
| Storefront journey (product → publish → browse → cart) | ✅ PASS |
| **Order via WhatsApp** (settings → product → cart → checkout → WhatsApp order → merchant dashboard) | ✅ PASS |
| Storefront guest access | ✅ PASS |
| Admin catalog CRUD / auth lifecycle / orders / customers / inventory / i18n RTL | ✅ PASS |
| Paymob live card checkout | ⏭ SKIPPED (correctly — credentials absent) |
| New-merchant onboarding signup | ❌ external blocker (Supabase GoTrue rejects the `@ziad.test` domain — stays on /signup; Phase 21 blocker) |

Full web E2E tally: **21 passed / 1 skipped / 1 failed (external)**.

### Real Paymob TEST payment — BLOCKED
`PAYMOB_API_KEY`, `PAYMOB_PUBLIC_KEY` and `PAYMOB_HMAC_SECRET` are placeholder values in the
environment (verified). The provider FAILS CLOSED at initiation. The integration id `4624759`
is known but is not sufficient without the secret credentials. **No live card payment was
performed and none is claimed.** All non-live validations (initiation request shape, HMAC,
state transitions, idempotency, inventory, fallback) are covered by unit/e2e tests.

---

## 18. Remaining blockers

1. Real Paymob credentials (`PAYMOB_API_KEY`, `PAYMOB_PUBLIC_KEY`, `PAYMOB_HMAC_SECRET`) +
   a live TEST card payment + webhook round-trip.
2. Public webhook URL (`PAYMOB_WEBHOOK_URL`) and production storefront domain for the
   redirect/return leg.
3. Supabase GoTrue accepts a real signup domain for the onboarding E2E (the `@ziad.test`
   TLD is rejected).
4. Phase 21 blockers unchanged (wildcard DNS, RLS live enforcement, pilot cleanup apply).

---

## 19. Production requirements

1. Set all four required `PAYMOB_*` credentials (api key, integration id, public key, HMAC
   secret) and set `PAYMOB_WEBHOOK_URL` to the public webhook endpoint.
2. Configure the webhook + return URL in the Paymob dashboard (or rely on `notification_url`).
3. Verify a live TEST card payment end-to-end.
4. Merchants enable WhatsApp orders with a valid international number in Dashboard → Settings.

---

## 20. Final GO / NO-GO recommendation

**GO WITH CONDITIONS.**

All code, schema, security, idempotency, state-machine, inventory and WhatsApp requirements are
implemented and validated by unit + e2e tests, and the WhatsApp fallback was verified LIVE
through the real stack (real Supabase, real merchant session, real order created, wa.me URL
generated, merchant dashboard shows the WhatsApp channel). The only external verification that
cannot be honestly completed in this environment is explicitly **BLOCKED**: the live Paymob
TEST card payment (credentials absent). Once the real Paymob credentials + webhook URL are
provided and a TEST card payment is confirmed, the payment/order acquisition layer is
production-ready.

- `e2e/storefront.spec.ts` (Paymob gate fix + WhatsApp E2E), `lib/storefront/whatsapp.test.ts`

---

## 16. Tests

| Suite | Count | Result |
| --- | --- | --- |
| API unit | 1003 | PASS (was 986 before Phase 22) |
| Web unit | 102 | PASS (was 91 before Phase 22) |
| API E2E | 436 passed / 264 skipped (RLS/DB suites BLOCKED) | PASS |
| API typecheck / lint / build | — | PASS |
| Web typecheck / lint / build | — | PASS |
| Web E2E (Playwright, live stack) | 21 passed / 1 skipped (Paymob) / 1 failed (external Supabase signup) | RUN |

New/updated API tests: Paymob provider (Intention flow, missing creds, unified checkout URL,
client_secret handling, HMAC/parse preserved), checkout channel, store-settings (WhatsApp
config + tenant isolation e2e), WhatsApp domain (message EN/AR, URL encoding, no secrets),
WhatsApp service (create/reuse/idempotent/fallback), storefront commerce (WhatsApp order e2e,
checkout gate), orders (channel + WhatsApp-confirm reservation consumption), storefront
(payment methods in store view).

  detail; WhatsApp orders without a payment show "Unpaid — pending manual confirmation" and
  cannot be switched to an online payment from the dashboard.

---

## 11. Fallback behavior (Paymob failure)

When Paymob initiation fails, the checkout payment step shows:

> Online payment is currently unavailable. You can continue your order through WhatsApp.

Buttons: **Retry Paymob** / **Order via WhatsApp** (EN) — `الدفع الإلكتروني غير متاح حاليًا.`
`يمكنك إكمال طلبك من خلال واتساب.` `إعادة المحاولة` / `اطلب عبر واتساب` (AR).

The WhatsApp call passes the already-created `orderId`, so the server REUSES/transitions that
order instead of creating a duplicate. When NO payment method exists (Paymob unconfigured AND
WhatsApp disabled), the public checkout fails closed with a clear merchant configuration
error and no order is created.

---

## 12. Tenant isolation

- WhatsApp settings: merchant endpoints resolve the store from the trusted context.
- WhatsApp orders: the store comes from StorefrontStoreResolver (`X-Storefront-Slug`/Host) —
  a client-supplied store id is never accepted; cross-tenant orders fail closed (404/409).
- A customer cannot select another merchant's number or inject a different store.
- Storefront public reads are store-scoped to the resolved store.

   (idempotent via `Idempotency-Key`).
3. Customer chooses **Pay Online** → `POST /storefront/orders/:orderId/payments` creates the
   PENDING payment + attempt in one tenant-bound transaction, then (outside the transaction)
   calls Paymob Intention and returns `providerCheckoutUrl`.
4. The checkout page renders the Unified Checkout (provider-hosted) in an iframe. Card data is
   NEVER collected or stored by this application.
5. Paymob redirects the customer back to `redirect_url` and posts the transaction-process
   callback to `POST /webhooks/paymob` (the authoritative confirmation).

---

## 5. Webhook / HMAC flow (preserved + verified)

- `POST /api/v1/webhooks/paymob` is `@Public()`; authenticity comes only from the Paymob HMAC
  (SHA-512 over the documented `obj` field concatenation with the hmac_secret, timing-safe
  compare). Missing/invalid signatures and malformed payloads are rejected (400, fail closed).
- Processing: claim the `payment_events` row (UNIQUE provider+provider_event_id — duplicate
  deliveries are safe no-ops) → resolve the payment from `merchant_order_id` → apply guarded
  transitions in ONE tenant-bound transaction → mark the event PROCESSED.
- SUCCESS → payment SUCCEEDED, reservations ACTIVE→CONSUMED, order PENDING→CONFIRMED.
  FAILURE → payment FAILED, reservations ACTIVE→RELEASED.
- Browser redirects are never authoritative.
