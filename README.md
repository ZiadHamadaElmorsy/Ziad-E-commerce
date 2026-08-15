# Ziad E-commerce

Egypt-first SaaS e-commerce platform that lets merchants create and operate an online store.

**Current phase: Phase 0 — Project Foundation.** No business features are implemented yet.

## Architecture

Modular monolith. See `docs/` for the authoritative specifications.

| Layer                         | Technology                                                |
| ----------------------------- | --------------------------------------------------------- |
| Frontend (Storefront + Admin) | Next.js (App Router) · React · TypeScript                 |
| Backend API                   | NestJS · TypeScript (REST, prefix `/api/v1`)              |
| Database                      | PostgreSQL (Supabase) · Prisma ORM · versioned migrations |
| Platform services             | Supabase Auth · Supabase Storage                          |

The MVP intentionally does **not** use microservices, Kubernetes, Kafka, Redis-based
queues, search infrastructure, sharding, or multi-region infrastructure.

## Repository structure

```text
├── apps/
│   ├── api/          # NestJS backend (modular monolith)
│   │   ├── prisma/   # Prisma schema + migrations
│   │   └── src/      # config, prisma, health, common (error handling)
│   └── web/          # Next.js frontend (application shell)
├── docs/             # Project documentation (source of truth)
├── .env.example      # Canonical environment template (placeholders only)
└── package.json      # npm workspaces + root scripts
```

## Prerequisites

- Node.js >= 20.9 (developed against Node 24)
- npm >= 10
- PostgreSQL database — Supabase project or local Postgres
  (only required to run migrations or connect the API; lint/typecheck/test/build work without it)

## Installation

```bash
npm install
```

Installation also runs `prisma generate` — via the `@ziad/api` workspace `postinstall`
script (backend-only; the web workspace does not trigger Prisma generation).

## Environment setup

Copy the templates and fill in real values. Never commit `.env` files.

```bash
# Root (.env is read automatically by the API)
cp .env.example .env

# Web app (read by Next.js; only needed once frontend env vars are used)
cp apps/web/.env.example apps/web/.env
```

Required for the API to boot: `DATABASE_URL`. See `.env.example` for the full list.

Database migrations (requires a reachable PostgreSQL instance):

```bash
npm run db:migrate    # create + apply a new migration (dev)
npm run db:deploy     # apply existing migrations (non-interactive)
npm run db:validate   # validate the Prisma schema
npm run db:generate   # regenerate the Prisma client
```

## Commands

| Command                                         | Description                                         |
| ----------------------------------------------- | --------------------------------------------------- |
| `npm run dev`                                   | Start API (`:4000`) and web (`:3000`) in watch mode |
| `npm run dev:api` / `npm run dev:web`           | Start a single app                                  |
| `npm run build`                                 | Production build for API and web                    |
| `npm run lint`                                  | ESLint for all workspaces                           |
| `npm run typecheck`                             | `tsc --noEmit` for all workspaces                   |
| `npm test`                                      | Unit tests for all workspaces                       |
| `npm run test:e2e`                              | API end-to-end tests                                |
| `npm run format:check` / `npm run format:write` | Prettier across the repo                            |

### Web

- Admin dashboard (client-rendered, Supabase Auth): `http://localhost:3000/login`
- The dashboard consumes the real API at `NEXT_PUBLIC_API_URL` with the
  authenticated Supabase session (Bearer access token attached automatically).
- Merchant modules: Dashboard (real product/order/revenue metrics), Products &
  Variants (CRUD, publish/unpublish/archive, SKU, compare-at pricing, category
  assignment), Categories (CRUD, archive, products-in-category), Orders (list,
  details, lifecycle status transitions, payment initiation/status), Customers
  (list, details, order history), Inventory (per-variant stock levels +
  adjustments + movements), Media (Supabase Storage upload/delete via the real
  API), Store & Settings (store name editing, subscription, account), full
  English/Arabic internationalization with LTR/RTL layout.
- Unit tests: `npm test -w @ziad/web` (Vitest + Testing Library)

## End-to-end testing

The primary testing approach is full end-to-end frontend testing with
Playwright (`apps/web/e2e`) — real browser → real UI → real Supabase
session → real API → real database. No mocks.

Prerequisites (all three must be running):

1. API: `npm run dev:api` (`http://localhost:4000`)
2. Web: `npm run dev:web` (`http://localhost:3000`)
3. A real Supabase merchant with an ACTIVE store membership. The spec reads
   `E2E_EMAIL` / `E2E_PASSWORD` (defaults to the local development merchant
   `e2e.merchant@ziad.test`).

Run the suite:

```bash
npm run test:e2e -w @ziad/web   # npx playwright test in apps/web
```

The suite covers: login through the UI, `/auth/me` resolution, category
create/edit/archive, product create/edit/publish/unpublish/archive, variant
create/edit/archive, category assignment, real API error rendering
(e.g. duplicate SKU conflicts), orders/customers/media/store rendering,
real inventory adjustments, and the Arabic/RTL switch.


### API

- Health: `GET http://localhost:4000/api/v1/health`
- OpenAPI/Swagger (dev only): `http://localhost:4000/api/docs`
- Errors use a consistent envelope: `{ "error": { "code", "message", "details" } }`
- Global validation pipeline, deliberate CORS (`CORS_ORIGINS`), and safe error responses are wired in `apps/api/src/app.setup.ts`.

## Security baseline (Phase 0)

- `.env*` files are git-ignored; `.env.example` contains placeholders only.
- No secrets, credentials, or production keys are committed.
- The API validates configuration at boot (fail-fast) and masks internal errors.
- CORS is explicit and configurable; validation is enabled globally.

## Documentation

The `docs/` directory is the source of truth: BRD, MVP scope, PRD, architecture,
domain model, API spec, user stories, AI agent rules, and database specification.

## Roadmap

- **Phase 0 (current):** project foundation — completed when lint, typecheck, tests and builds pass.
- **Phase 1 (next, after review):** Authentication (Supabase Auth).
- Later phases: Store, Catalog, Inventory, Storefront, Cart, Checkout, Orders, Payments (Paymob), CMS, Media.
