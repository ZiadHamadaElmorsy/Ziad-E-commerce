# Ziad E-commerce — Production Deployment Runbook (Phase 23)

**Scope:** first controlled real-merchant pilot. Single-region, single-API-instance
deployment (modular monolith — `Reliability Before Scale`, docs/ARCHITECTURE.md §3.5).

```text
Internet
   ↓
DNS / CDN / Reverse Proxy  (Cloudflare / Vercel edge / Caddy / Nginx)
   ↓
Web (Next.js)   ── https://yourdomain.com, https://{slug}.yourdomain.com
   ↓
API (NestJS)    ── https://api.yourdomain.com
   ↓
PostgreSQL (Supabase) + Supabase Auth + Supabase Storage
   ↓
Paymob (Intention API + Unified Checkout)
```

---

## 1. Prerequisites

- Node.js ≥ 20.9, npm ≥ 10.
- PostgreSQL 14+ (this project targets **Supabase** — database, Auth, Storage).
- A domain with wildcard DNS capability (`yourdomain.com` + `*.yourdomain.com`).
- A Paymob account with the Intention API enabled (test + production): API key,
  card integration id, public key, HMAC secret.
- (Optional) a WhatsApp number per merchant (regular wa.me links — **no WhatsApp
  Business API is required for the pilot**).

## 2. Environment variables

Copy `apps/api/.env.example` / `apps/web/.env.example` / root `.env.example` to
`.env`. Never commit `.env`. The API reads the repository-root `.env`.

### Public (safe in the browser bundle — `NEXT_PUBLIC_*`)
| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | API base incl. `/api/v1` (prod: `https://api.yourdomain.com/api/v1`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (public by design) |
| `NEXT_PUBLIC_APP_URL` | Canonical web origin used for auth redirects. Local: `http://localhost:3000`. Production: `https://ziad-e-commerce-web-sigma.vercel.app` (must be https). If unset, `apps/web/lib/config.ts` falls back to the centralized production origin — the production confirmation email must never redirect to localhost. |
| `NEXT_PUBLIC_SUPPORT_PHONE` | Public support phone shown on the auth screens (`tel:` link). Placeholder until the merchant supplies the real number. |

### Server-only secrets (never in browser, never in Git)
| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (server-only) |
| `PAYMOB_API_KEY` | Paymob secret API key |
| `PAYMOB_HMAC_SECRET` | Paymob webhook HMAC secret |
| `PAYMOB_WEBHOOK_URL` | full public webhook URL (see §13) |

### Deployment configuration
| Variable | Production value |
| --- | --- |
| `NODE_ENV` | `production` |
| `CORS_ORIGINS` | explicit allowlist — **never `*`** (API refuses to boot with a wildcard) |
| `STOREFRONT_DOMAIN` | apex domain, e.g. `yourdomain.com` |
| `STOREFRONT_HOST_RESOLUTION_ENABLED` | `true` (default in production) |
| `RLS_ENFORCEMENT_ROLE` | `ziad_runtime` (see §4) |
| `TRUST_PROXY` | `1` (behind CDN/load balancer) or the proxy address |
| `SECURITY_HSTS_ENABLED` | `true` **only after HTTPS is verified** |
| `PAYMOB_*` | all four credentials + webhook URL |
| `SUPABASE_STORAGE_BUCKET` | `media` |
| `RESERVATION_EXPIRY_ENABLED` | `true` (default in production) |
| `RESERVATION_EXPIRY_LEASE_TTL_MS` | `600000` |
| `RATE_LIMIT_*` | defaults are safe; tune after observing traffic |

## 3. Database setup

1. Create a Supabase project (or any PostgreSQL 14+).
2. `DATABASE_URL` — use the **transaction pooler** (port 6543) for the app; keep
   `DIRECT_URL` (port 5432) for migrations.
3. Keep the service-role key in the secrets manager, never in the client.

## 4. Migrations (RLS — production-safe role strategy)

The runtime application role must **never** run as the table owner. The migrations
ship this contract:

```sql
-- 20260814000000_rls_enforcement
CREATE ROLE ziad_runtime NOLOGIN IN ROLE authenticated;
GRANT USAGE ON SCHEMA public TO ziad_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ziad_runtime;
GRANT EXECUTE ON FUNCTION app.set_current_store_id(uuid) TO ziad_runtime;
ALTER TABLE "..." FORCE ROW LEVEL SECURITY;  -- all 28 tenant tables
```

Deployment steps:

```bash
# 1. connect as a role with migration privileges
# 2. apply ALL migrations in order:
DATABASE_URL="postgresql://<migration-user>@db:5432/db" \
  npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
# 3. create a LOGIN runtime role member of ziad_runtime:
#    CREATE ROLE ziad_app LOGIN PASSWORD '<strong>' IN ROLE ziad_runtime;
# 4. point the app's DATABASE_URL at ziad_app (or a pooler using it)
```

Every tenant-bound transaction runs through `TransactionService.runWithTenant`,
which issues `SET LOCAL ROLE ziad_runtime` + `SELECT app.set_current_store_id(...)`.
Combined with `FORCE ROW LEVEL SECURITY`, the connection **cannot bypass RLS** even
if the application filter were wrong. Do **not** run the app as the table owner;
do **not** disable RLS.

**Order matters:** apply the migration AND the role switch together. Applying
`FORCE RLS` while the app still connects as the owner (no role switch) makes every
read return zero rows.

## 5. Supabase setup

- **Auth:** enable email/password; for the pilot use pre-provisioned, confirmed
  merchants (the onboarding E2E is blocked when the Auth provider rejects the
  test TLD — a real, confirmed email is required for pilot merchants).
- **Auth → URL Configuration (required for email confirmation to reach the
  production app):**
  - **Site URL:** `https://ziad-e-commerce-web-sigma.vercel.app`
    (NOT `http://localhost:3000` — the current value redirects production
    confirmation emails to localhost).
  - **Redirect URLs:** keep `http://localhost:3000/**` (local development) and
    add `https://ziad-e-commerce-web-sigma.vercel.app/**` (or the exact path
    `https://ziad-e-commerce-web-sigma.vercel.app/login`, which is the
    callback path the app passes as `options.emailRedirectTo`). Supabase
    requires the `redirectTo` URL to match the allowlist.
- **RLS policies** come from the migrations (do not recreate manually).

## 6. Storage setup

- Create a private bucket named `media`.
- The API uses the **service-role key** server-side only; the browser never sees it.
- No public bucket reads — all reads go through
  `GET /api/v1/storefront/media/:mediaId/content` (store-scoped, MIME-validated).
- Object keys are `storeId/mediaId.ext`; uploads reject path traversal (Phase 21).

## 7. Redis

**Not required for the pilot.** Rate limiting is in-memory (single API instance) and
the expiry sweep is coordinated by a PostgreSQL lease (`job_leases`, no Redis).
If the API later scales to 2+ instances, replace the in-memory rate limiter with a
shared store behind the same `RateLimitService` interface (see the Phase 23 report §8).

## 8. API deployment

```bash
npm run build -w @ziad/api          # → apps/api/dist
cd apps/api
NODE_ENV=production node dist/main.js    # listens on 0.0.0.0:4000 (PORT env)
```

- Single instance for the pilot (reservation sweep lease + in-memory rate limiter).
- Run under a process supervisor (systemd / pm2) with automatic restart.
- **Migrations must be applied before the new build starts** (see §4) — the expiry
  sweep requires the `job_leases` table.

## 9. Web deployment

```bash
npm run build -w @ziad/web          # → apps/web/.next (includes proxy.ts)
cd apps/web
NODE_ENV=production npx next start -p 3000
```

- The Next.js `proxy.ts` rewrites `{slug}.{STOREFRONT_DOMAIN}/*` to
  `/store/{slug}/*` **without redirecting** (browser URL preserved). The API is the
  authoritative store resolver.
- The storefront client talks to the API with `X-Storefront-Slug`; CORS must list
  every web origin (root + www).

## 10. DNS

| Record | Type | Value |
| --- | --- | --- |
| `yourdomain.com` | A / CNAME | → CDN / web host |
| `www.yourdomain.com` | CNAME | → `yourdomain.com` |
| `*.yourdomain.com` | CNAME | → CDN / web host (storefront subdomains) |
| `api.yourdomain.com` | A / CNAME | → API host (may be the same CDN, route `/api/v1/*`) |

Root domain → marketing website; `{slug}.yourdomain.com` → storefront;
`api.yourdomain.com` → API. Unknown subdomains still resolve (wildcard) but the app
fails closed with 404.

## 11. SSL

- Wildcard TLS certificate `*.yourdomain.com` + `yourdomain.com` (Let's Encrypt /
  Cloudflare / provider).
- Terminate TLS at the edge; forward plain HTTP to origin **only** inside the
  private network (or use an HTTPS-only setup).
- Enable HSTS only after HTTPS is verified: `SECURITY_HSTS_ENABLED=true` (web + API).

## 12. Wildcard domain

- `STOREFRONT_DOMAIN=yourdomain.com` on BOTH the API and the web.
- Storefront host resolution is enabled by default in `NODE_ENV=production`.
- StorefrontStoreResolver + web proxy both use the same slug rules
  (`{slug}.yourdomain.com`; root/www/foreign hosts are never storefronts).
- Verify with `curl -H "Host: {slug}.yourdomain.com" https://api.yourdomain.com/api/v1/storefront`.

## 13. Paymob webhook configuration

1. Set `PAYMOB_WEBHOOK_URL=https://api.yourdomain.com/api/v1/webhooks/paymob`
   (sent as `notification_url` on every Intention — works without dashboard config).
2. Also configure the same URL in the Paymob dashboard if preferred.
3. The endpoint is `@Public()` — authenticity comes ONLY from the HMAC
   (SHA-512, timing-safe) → unverified callbacks get 400.
4. The webhook is idempotent (UNIQUE provider+event id), resolves the tenant from
   the payment row (never client input), and returns 200 to verified events.

## 14. WhatsApp configuration

Per merchant (dashboard → Settings):
- Enable "WhatsApp Orders" and set the number (`+20...`, E.164).
- Store-scoped config (`store_settings`); unavailable stores fail closed (409).
- Orders via WhatsApp create REAL orders (channel WHATSAPP, PENDING, unpaid) and the
  merchant confirms them manually in Orders.


## 15. Health checks

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v1/health` | combined status (DB non-fatal, "degraded" reporting) |
| `GET /api/v1/health/live` | liveness — no dependency I/O, never rate-limited |
| `GET /api/v1/health/ready` | readiness — 503 while the database is down |

Configure the orchestrator: liveness → `/health/live` every 10s; readiness →
`/health/ready` every 10s with a startup grace period.

## 16. Smoke tests

After deploy:

```bash
curl -s https://api.yourdomain.com/api/v1/health/ready          # 200, database up
curl -s -H "Host: ziad-fashion.yourdomain.com" \
  https://api.yourdomain.com/api/v1/storefront                   # 200, real store
curl -s https://yourdomain.com                                    # 200, marketing site
curl -s https://api.yourdomain.com/api/v1/storefront             # 401 (auth required)
```

Then a human smoke test: merchant sign-in → dashboard → product → inventory →
publish → storefront browse → cart → checkout → Paymob TEST payment (or WhatsApp
order) → order visible in the dashboard.

## 17. Rollback

- **App rollback:** redeploy the previous build (migrations are forward-only and
  additive; the new migrations do not break the old build except the expiry sweep,
  which fails gracefully and logs).
- **Migration rollback:** the Phase 23 migration is additive (new column + table).
  If needed, `DROP TABLE job_leases; ALTER TABLE orders DROP COLUMN lookup_token;`
  and remove the migration row — only during the pilot window before merchant data
  depends on it.
- **Database restore:** see §18 (point-in-time restore is the primary path).

## 18. Backup

Supabase provides automated daily backups + PITR (paid tier). Recommended:

- Daily automated backups (Supabase) + a weekly `pg_dump` to object storage.
- Retention: 7 daily + 4 weekly dumps; Supabase PITR retention 7 days.
- Restore validation: monthly restore to a scratch project and run
  `npm run test:e2e -w @ziad/api` (RLS suites included) against it.

## 19. Monitoring

Pilot-minimal, no heavy stack:

- **Uptime/latency:** UptimeRobot / Better Uptime pinging `/health/live` + `/health/ready`.
- **5xx/4xx:** API request logs (`Nest` logger) + error filter already logs every
  failed request with the request ID. Ship logs to a lightweight sink.
- **Database:** Supabase dashboard (connections, latency, CPU).
- **Payments/webhooks:** the webhook service logs safe structured lines
  (`eventId=... paymentId=... storeId=... status=...`); alert on `payment_unresolved`
  counts. Payment initiation failures are 409s with a safe envelope.
- **Alert thresholds (pilot):** readiness 503 > 2 min; webhook `payment_unresolved`
  > 5 in an hour; 5xx rate > 1% over 10 min.

## 20. Incident response basics

1. **Liveness down** → process crash/restart loop: check `node dist/main.js` exit
   logs, disk, memory; restart via supervisor.
2. **Readiness 503** → database unreachable: check Supabase status page, pooler
   limits, `DATABASE_URL` credentials.
3. **Payments not confirming** → verify `PAYMOB_WEBHOOK_URL` reachable, HMAC secret
   matches the dashboard, check `payment_events` rows for `processing_status`.
4. **Storefront 404 for a real store** → host resolution misconfig:
   `STOREFRONT_DOMAIN` mismatch between web and API, or DNS wildcard missing.
5. **Always** preserve logs with request IDs; never paste secrets into the incident
   channel.

