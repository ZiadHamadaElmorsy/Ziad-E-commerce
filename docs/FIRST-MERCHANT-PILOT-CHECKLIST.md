# FIRST MERCHANT PILOT — GO-LIVE CHECKLIST

**Purpose:** the controlled sign-off sheet for the first real merchant pilot.
Every item must be verified against REAL infrastructure before the merchant
takes real orders. `[ ]` = not yet verified, `[x]` = verified, `[BLOCKED]` =
cannot be verified from this environment (external dependency).

---

## 1. Infrastructure

- [ ] **Production domain** — a real apex domain (e.g. `yourdomain.com`) is
  registered and owned. Current `STOREFRONT_DOMAIN=platform-domain.com` is a
  placeholder and is NOT a production domain.
- [ ] **Wildcard DNS** — `*.yourdomain.com` → the web/API host (A/AAAA or
  CNAME to the CDN/proxy).
- [ ] **SSL/TLS** — valid wildcard certificate for `*.yourdomain.com`
  (auto-renew), verified from outside the local machine
  (`curl https://{slug}.yourdomain.com -I`).
- [ ] **API URL** — `NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api/v1` in
  the production web environment.
- [ ] **Production environment** — `NODE_ENV=production`, `TRUST_PROXY=1`,
  `SECURITY_HSTS_ENABLED=true` (only after HTTPS is verified),
  `CORS_ORIGINS` = explicit allowlist (never `*`).
- [ ] **Database** — a dedicated production PostgreSQL (or a Supabase project
  created FOR the pilot, not the shared development database).
- [ ] **Storage** — private `media` bucket created; upload + storefront image
  delivery verified.
- [ ] **Monitoring** — uptime monitor on `/health/live` + `/health/ready`;
  webhook/payment alerts on `payment_unresolved`.
- [ ] **Backups** — daily automated backups + weekly `pg_dump` to object
  storage; restore tested once to a scratch project.

## 2. Security

- [ ] **RLS** — `ziad_runtime` role + FORCE ROW LEVEL SECURITY applied;
  the app connection switches to the enforcement role inside tenant-bound
  transactions; `scripts/rls-verify.ts` → PASS. See FINAL-GO-LIVE-CLOSURE §4.
- [ ] **Tenant isolation** — Merchant A cannot read/write Merchant B (RLS
  probe + API cross-tenant e2e).
- [ ] **Secrets** — no secrets in Git (only `.env.example` tracked); Paymob/
  Supabase secrets are server-only env values.
- [ ] **Rate limiting** — public surface 429s exceed the configured limit;
  `Retry-After` returned.
- [ ] **Security headers** — `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `X-XSS-Protection`, `Permissions-Policy` (+ HSTS in
  production).
- [ ] **CORS** — explicit allowlist; API refuses to boot in production with a
  wildcard origin.
- [ ] **Media security** — 10 MB cap, MIME allowlist, magic-byte check, safe
  storage keys (400 on oversize/type-mismatch probes).
- [ ] **Webhook HMAC** — `POST /api/v1/webhooks/paymob` rejects missing/invalid
  signatures (400) and verifies with SHA-512 + timing-safe compare.
- [ ] **Order lookup security** — per-order lookup token; no PII without the
  token; lookup endpoint rate-limited.

## 3. Payments (Paymob)

- [BLOCKED] **Paymob TEST verified** — a real Paymob TEST card transaction must
  complete: intention → Unified Checkout → card → webhook → order CONFIRMED.
  Required inputs that are absent in this environment:
  `PAYMOB_PUBLIC_KEY` (the account's public key) and `PAYMOB_WEBHOOK_URL`
  (a public HTTPS webhook URL, e.g. `https://api.yourdomain.com/api/v1/webhooks/paymob`).
- [BLOCKED] **Webhook verified** — the public webhook URL must be reachable by
  Paymob from the internet (local development may use a documented temporary
  tunnel — never a faked callback).
- [BLOCKED] **Failed payment verified** — a declined TEST card must produce
  payment FAILED + reservation RELEASED.
- [ ] **Duplicate callback verified** — replaying a webhook is a safe no-op
  (`payment_events` UNIQUE dedup).


> Note: with the current credentials, the Paymob Intention endpoint
> (`POST /v1/intention`) returned `401 Authentication credentials were not
> provided` for every auth format probed (body `api_key`, query param, Bearer
> and Token headers, `X-Api-Key`). The account's API key authenticates on
> `/api/auth/tokens` but the Intention API did not accept it. The merchant must
> confirm the current Intention API auth contract (a new-format secret key may
> be required) before the pilot can take online payments. This is part of the
> Paymob TEST blocker — do not skip.

## 4. WhatsApp

- [ ] **Merchant number** — a real, reachable WhatsApp number configured in
  Store Settings.
- [ ] **WhatsApp enabled** — the storefront payment-methods view shows WhatsApp
  ordering.
- [ ] **Order creation** — a customer "Order via WhatsApp" creates a REAL
  PENDING (unpaid) order.
- [ ] **Message generation** — EN/AR order message with the correct product
  lines and no PII leaks.
- [ ] **Merchant receipt** — the order appears in the merchant dashboard and the
  merchant confirms it manually.

## 5. Merchant

- [ ] **Signup** — a real, confirmed merchant email (not a throwaway, not the
  E2E account `e2e.merchant@ziad.test`).
- [ ] **Onboarding** — merchant completes store creation + appearance + first
  product.
- [ ] **Product** — at least one published product with a price.
- [ ] **Inventory** — inventory rows exist for purchasable variants.
- [ ] **Publish** — products ACTIVE and visible on the storefront.
- [ ] **Storefront** — `https://{slug}.yourdomain.com` returns the store (and
  the local `/store/{slug}` route still works).

## 6. Customer

- [ ] **Browse** — the storefront lists ACTIVE products.
- [ ] **Cart** — add/update/remove items; quantity limits enforced.
- [ ] **Checkout** — customer details + address validation; inventory reserved.
- [ ] **Paymob** — online card checkout (BLOCKED until §3 is verified).
- [ ] **WhatsApp** — order via WhatsApp fallback creates a real order.
- [ ] **Order confirmation** — the customer sees a confirmation; the merchant
  sees the order; inventory behaves per the matrix below.

## 7. Inventory behaviour matrix (verify on the pilot)

| Scenario | Expected |
| --- | --- |
| Paymob success | reservation CONSUMED, order CONFIRMED, one deduction |
| WhatsApp order | order PENDING/manual, no reservation consumption |
| Failed payment | reservation RELEASED |
| Expired reservation | inventory released by the expiry sweep |
| Duplicate webhook | no double deduction (idempotent) |

## 8. Final smoke test

Run the merchant journey (marketing → signup → onboarding → store → product →
inventory → publish → view store) and the customer journey (browse → cart →
checkout → Paymob TEST or WhatsApp → order → merchant dashboard), then record
the result in FINAL-GO-LIVE-CLOSURE.md §10.
