# Ziad E-commerce — Database Specification

**Version:** 2.0

**Status:** FINAL

**Owner:** Ziad

**Technical Lead:** CTO / AI-assisted development

**Architecture:** PostgreSQL + Supabase (Shared Schema + Row-Level Security)

**Multi-tenancy:** Shared Schema + RLS (defense-in-depth)

---

> **Authority:** This document is the authoritative database specification for the Ziad E-commerce MVP.
> It is derived from `docs/DOMAIN-MODEL.md` (v2.0, FINAL) and MUST remain fully aligned with it.
> It is the direct input to the next phase: **PRISMA SCHEMA → MIGRATION → IMPLEMENTATION**.
> It is a specification only; it contains no Prisma schema, migration, or application code.

---

# 1. Purpose

The Database Specification defines the complete persistence model for the MVP:

- Every persisted entity, its table, primary key, foreign keys, unique constraints, indexes, and lifecycle statuses.
- Tenant/store ownership and RLS isolation requirements.
- Inventory correctness (on-hand / reserved / available, reservations, movements).
- Order and payment persistence with historical integrity.
- Cart, customer, membership, subscription, CMS, and media persistence.
- Delete/retention, concurrency, idempotency, and transaction rules.
- The exact boundary between MVP tables and future tables.

The next phase (Prisma schema + migrations) must implement this specification without adding, removing, or renaming MVP tables or altering relationships.

---

# 2. Document Chain and Authority

Source-of-truth chain:

```text
BRD -> PRD -> MVP-SCOPE -> ARCHITECTURE -> DOMAIN-MODEL -> DATABASE -> API-SPEC -> USER-STORIES -> ROADMAP
```

Authority rules:

- `docs/DOMAIN-MODEL.md` (v2.0, **FINAL**) is the authoritative domain source for the MVP and takes priority over older database terminology or assumptions.
- DATABASE.md is subordinate to DOMAIN-MODEL.md. Every entity, relationship, status, and invariant in this document traces to DOMAIN-MODEL.md.
- Contradictions found during finalization are reported and resolved in the task Finalization Report; no contradiction remains open.
- No business rule is invented here. Decisions required by the database design that are not defined by the source documents are classified in Section 33 (Open Technical Decisions) as:
  1. Required database decision
  2. Technical implementation decision
  3. Future scope
  4. Requires Product Owner approval
- Technical decisions that do not alter business behavior may be finalized here.

---

# 3. Database Architecture

```text
Next.js Storefront / Admin
        |
        v
   NestJS API (modular monolith)
        |
   +-------+--------+
   |       |        |
   v       v        v
PostgreSQL   Supabase Auth   Supabase Storage
(source of truth)  (identity)    (media binaries)
   |
   v
External providers (Paymob = payment adapter only)
```

- One shared PostgreSQL database; all tenants share the same tables.
- Isolation is enforced by: (1) mandatory `store_id` scoping on every tenant-owned table, (2) application-layer authorization, and (3) PostgreSQL Row-Level Security as defense-in-depth.
- The database is the authoritative source of truth for: products, variants, inventory, customers, carts, orders, payments, store configuration, CMS, subscription state, audit records.
- External systems (Paymob, email, Meta) are never the source of truth for core commerce data.
- **No Redis, Kafka, RabbitMQ, microservices, or distributed inventory infrastructure in the MVP.** Background work (e.g., reservation expiration) runs inside the modular monolith or lazily.
- Media binaries live in Supabase Storage; PostgreSQL stores metadata and references only.
- Identity comes from Supabase Auth (`auth.users`); the application schema stores application users, memberships, and Store data.

---

# 4. Database Principles

P1. The database enforces integrity through primary keys, foreign keys, unique constraints, check constraints, transactions, indexes, and RLS. Application logic is never the only protection for tenant isolation or critical business invariants.
P2. Money is stored as **integer minor units** (BRD BR-VARIANT-002); floating point is forbidden for money. For EGP the minor unit is the piastre.
P3. Quantities are integers; fractional unit quantities are out of MVP scope.
P4. Historical commerce data (orders, order items, payments, inventory movements, audit logs) is immutable and must never be silently rewritten.
P5. Every tenant-owned row is traceable to exactly one Store.
P6. Timestamps are stored as `timestamptz` (UTC); timezone presentation is a presentation-layer concern (Store timezone is a Store attribute).
P7. Checkout is NOT a persistent entity. **No checkout table exists.**
P8. Schema changes are made only through versioned, reviewable, reproducible migrations.
P9. The architecture must remain compatible with future capabilities (cart recovery, refunds, invoices, additional payment providers) without redesigning the MVP tables.
P10. No AI agent may create, remove, rename, or significantly modify database tables or relationships without updating this document and receiving explicit approval (Section 35).

---

# 5. Tenant / Store Isolation

## 5.1 Tenant Model

The **Store** is the primary tenant and business ownership boundary.

```text
Store (tenant boundary)
  +-- Products, ProductVariants, Categories, ProductCategories
  +-- Inventory, InventoryReservations, InventoryMovements
  +-- Customers, CustomerAddresses
  +-- Carts, CartItems
  +-- Orders, OrderItems, Payments, PaymentAttempts, PaymentEvents
  +-- Pages, PageSections, Navigations, ThemeConfigurations
  +-- Media, ProductMedia
  +-- Subscriptions, StoreSettings
  +-- AuditLogs
  +-- StoreMemberships (store-scoped access records)
```

Platform-level (NOT Store-owned):

- `users` (platform identity)

Distinct concepts (DOMAIN-MODEL §18):

- User identity: who you are on the platform.
- Store membership: which Stores you may access and with which role.
- Store ownership: which Store is the merchant's business boundary.

## 5.2 Direct vs Inherited Store Ownership

**(a) Direct store ownership** — the table carries its own `store_id` column:

| Table | store_id |
|---|---|
| stores | the tenant table itself |
| store_memberships, subscriptions | yes |
| products, product_variants, categories, product_categories | yes |
| inventory, inventory_reservations, inventory_movements | yes |
| customers, customer_addresses | yes |
| carts | yes |
| orders | yes |
| payments | yes |
| payment_events | yes (nullable until the payment is resolved) |
| pages, page_sections | yes |
| navigations, theme_configurations, store_settings | yes |
| media, product_media | yes |
| audit_logs | yes |

**(b) Inherited ownership** — no `store_id` column; the Store is resolved through the parent FK and RLS traverses the parent:

| Table | Store resolved through |
|---|---|
| cart_items | carts.store_id |
| order_items | orders.store_id |
| payment_attempts | payments.store_id |

Rationale: `cart_items`, `order_items`, and `payment_attempts` are only ever accessed through their parent aggregate in the MVP. Every other tenant table is queried independently (admin lists, RLS simplicity, webhook ingestion) and therefore carries `store_id` directly.

## 5.3 Enforcement Stack

1. **Application authorization (primary):** every request resolves User → StoreMembership → Store; the backend scopes every query by the authorized Store. Cross-tenant access returns 404/403.
2. **Row-Level Security (defense-in-depth):** enforced on every tenant table (Section 29). Frontend filtering is never a security boundary.
3. **Database constraints (integrity):** composite foreign keys prevent a child row from referencing a parent in a different Store (Section 9).
4. **Unique constraints** prevent cross-store collisions of per-Store identifiers (SKU, slug, order_number, idempotency keys).

## 5.4 Public Storefront Access

- Storefront requests are anonymous (no authenticated merchant). The Store is resolved from the public storefront URL (store slug/domain), never from client-supplied Store IDs.
- The public access path uses a dedicated read-only policy set exposing only published, ACTIVE, in-stock data of the resolved Store.
- Public queries must never bypass RLS for one tenant and expose another tenant's data.

---

# 6. Entity-to-Table Mapping

Every DOMAIN-MODEL.md MVP entity, mapped to its persistence decision. Checkout is intentionally absent (no table).

| Domain Model Entity | Persisted (MVP)? | Table | Primary Key | Store Ownership | Lifecycle / Status |
|---|---|---|---|---|---|
| User | Yes | users | id (UUID) | Platform-level (none) | Supabase Auth identity |
| Store | Yes | stores | id (UUID) | Root tenant | store_status |
| StoreMembership | Yes | store_memberships | id (UUID) | Direct | membership_role + membership_status |
| Subscription | Yes | subscriptions | id (UUID) | Direct (1:1 store) | subscription_status |
| Product | Yes | products | id (UUID) | Direct | product_status |
| ProductVariant | Yes | product_variants | id (UUID) | Direct (through product) | variant_status |
| Category | Yes | categories | id (UUID) | Direct | category_status |
| ProductCategory | Yes | product_categories | id (UUID) | Direct | None (associative) |
| Inventory | Yes | inventory | id (UUID) | Direct (through variant) | None (continuous quantities) |
| InventoryReservation | Yes | inventory_reservations | id (UUID) | Direct (through variant) | reservation_status |
| InventoryMovement | Yes | inventory_movements | id (UUID) | Direct (through variant) | Immutable |
| Customer | Yes | customers | id (UUID) | Direct | None (no MVP lifecycle) |
| CustomerAddress | Yes | customer_addresses | id (UUID) | Direct (through customer) | None |
| Cart | Yes | carts | id (UUID) | Direct | cart_status |
| CartItem | Yes | cart_items | id (UUID) | Inherited (through cart) | None |
| Order | Yes | orders | id (UUID) | Direct | order_status |
| OrderItem | Yes | order_items | id (UUID) | Inherited (through order) | Immutable (snapshots) |
| Payment | Yes | payments | id (UUID) | Direct | payment_status |
| PaymentAttempt | Yes | payment_attempts | id (UUID) | Inherited (through payment) | payment_status |
| PaymentEvent | Yes | payment_events | id (UUID) | Direct (nullable until resolved) | event_processing_status |
| Page | Yes | pages | id (UUID) | Direct | page_status |
| PageSection | Yes | page_sections | id (UUID) | Direct (through page) | None |
| Navigation | Yes | navigations | id (UUID) | Direct | None |
| ThemeConfiguration | Yes | theme_configurations | id (UUID) | Direct (1:1 store) | None |
| Media | Yes | media | id (UUID) | Direct | None |
| AuditLog | Yes | audit_logs | id (UUID) | Direct | Immutable |
| Checkout | **NO TABLE** | — | — | — | Orchestration boundary only |
| StoreSettings (supporting) | Yes | store_settings | id (UUID) | Direct | None |

Supporting/technical tables that are not domain entities but are required for store configuration: `store_settings`.

**Total: 28 MVP tables.**

---

# 7. Table Specifications

Conventions:

- PK: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` on every table.
- `store_id` columns are NOT NULL (unless stated), FK to `stores(id)`, and indexed.
- Timestamps: `created_at` / `updated_at` `timestamptz NOT NULL DEFAULT now()`. Immutable tables carry `created_at` only.
- Money = `BIGINT` integer minor units (e.g., piastres for EGP). Quantity = `INTEGER`.
- Enum values are written UPPERCASE (Postgres native ENUM vs `TEXT` + CHECK is a technical decision, Section 33).
- Every direct-ownership parent table also exposes `UNIQUE (store_id, id)` as the target for composite FKs (Section 9).

## 7.1 users

**Purpose:** Platform-level application user (application mirror of the Supabase Auth identity).
**Ownership:** Platform-level; NOT Store-owned. RLS: a user may access their own row.
**PK:** id.

| Column | Type | Null | Constraints / Notes |
|---|---|---|---|
| id | uuid | no | PK |
| auth_user_id | uuid | no | UNIQUE; Supabase auth.users reference |
| first_name | text | no | |
| last_name | text | no | |
| email | text | no | UNIQUE |
| phone | text | yes | |
| created_at | timestamptz | no | |
| updated_at | timestamptz | no | |

Passwords must NEVER be stored here (Supabase Auth owns credentials).

## 7.2 stores

**Purpose:** A merchant's store — the tenant boundary.
**Ownership:** Root tenant.
**PK:** id.

| Column | Type | Null | Constraints / Notes |
|---|---|---|---|
| id | uuid | no | PK |
| name | text | no | |
| slug | text | no | UNIQUE (global — public storefront URL base) |
| description | text | yes | |
| status | store_status | no | DEFAULT 'ACTIVE'; FINALIZED domain lifecycle |
| currency | char(3) | no | DEFAULT 'EGP'; ISO 4217 |
| timezone | text | no | DEFAULT 'Africa/Cairo' |
| created_at | timestamptz | no | |
| updated_at | timestamptz | no | |

Notes:
- The MVP public storefront URL is `store-slug.platform-domain.com`, so the Store slug is globally unique.
- Subscription expiry is an access overlay and is NOT a Store status.
- Store logo is a Media reference on `theme_configurations` (not a column here).

## 7.3 store_memberships

**Purpose:** Grants a User access to a Store with a fixed role.
**Ownership:** Direct store ownership.
**PK:** id.

| Column | Type | Null | Constraints / Notes |
|---|---|---|---|
| id | uuid | no | PK |
| store_id | uuid | no | FK stores |
| user_id | uuid | no | FK users |
| role | membership_role | no | OWNER / ADMIN / STAFF (FINALIZED) |
| status | membership_status | no | DEFAULT 'ACTIVE' (ACTIVE/INACTIVE — technical status) |
| created_at | timestamptz | no | |
| updated_at | timestamptz | no | |

Constraints:
- UNIQUE (store_id, user_id): one membership per user per store.
- Partial UNIQUE (store_id) WHERE role = 'OWNER': at most one OWNER per store.

Notes:
- The merchant who creates the Store is assigned the OWNER role.
- No custom per-membership permission overrides in the MVP.
- Member removal = status INACTIVE (soft), audited via audit_logs.

## 7.4 subscriptions

**Purpose:** Commercial subscription/access state of a Store (1:1).
**Ownership:** Direct store ownership.
**PK:** id.

| Column | Type | Null | Constraints / Notes |
|---|---|---|---|
| id | uuid | no | PK |
| store_id | uuid | no | FK stores; UNIQUE (1:1) |
| status | subscription_status | no | DEFAULT 'TRIAL'; FINALIZED domain lifecycle |
| trial_started_at | timestamptz | yes | |
| trial_ends_at | timestamptz | yes | configurable trial duration |
| activated_at | timestamptz | yes | set on TRIAL->ACTIVE |
| expires_at | timestamptz | yes | set on ->EXPIRED |
| created_at | timestamptz | no | |
| updated_at | timestamptz | no | |

Transitions (FINALIZED, application-enforced state machine): TRIAL->ACTIVE, TRIAL->EXPIRED, ACTIVE->EXPIRED, EXPIRED->ACTIVE.
Expiry is an access overlay (dashboard read-only, storefront disabled, data preserved), NOT a Store status.
No PAST_DUE / CANCELLED / SUSPENDED states.

## 7.5 products

**Purpose:** The logical sellable product.
**Ownership:** Direct store ownership.
**PK:** id.

| Column | Type | Null | Constraints / Notes |
|---|---|---|---|
| id | uuid | no | PK |
| store_id | uuid | no | FK stores |
| name | text | no | |
| slug | text | no | UNIQUE within store |
| description | text | yes | |
| status | product_status | no | DEFAULT 'DRAFT'; DRAFT/ACTIVE/ARCHIVED |
| created_at | timestamptz | no | |
| updated_at | timestamptz | no | |

Invariants:
- Every Product MUST have at least one ProductVariant (application-enforced at creation; a DB trigger is an optional defense, Section 33).
- DRAFT: not purchasable. ACTIVE: may appear on storefront. ARCHIVED: not newly purchasable.
- Historical order items never depend on current product fields.

## 7.6 product_variants

**Purpose:** The purchasable unit; the inventory boundary.
**Ownership:** Direct store ownership (through product).
**PK:** id.

| Column | Type | Null | Constraints / Notes |
|---|---|---|---|
| id | uuid | no | PK |
| store_id | uuid | no | FK stores |
| product_id | uuid | no | FK products; composite FK (store_id, product_id) |
| name | text | no | e.g., "Black / 42" |
| sku | text | yes | UNIQUE within store (when present) |
| price | bigint | no | integer minor units; CHECK (price >= 0) |
| compare_at_price | bigint | yes | integer minor units; CHECK (compare_at_price >= 0) |
| cost_price | bigint | yes | integer minor units; CHECK (cost_price >= 0) |
| status | variant_status | no | DEFAULT 'ACTIVE'; ACTIVE/ARCHIVED |
| created_at | timestamptz | no | |
| updated_at | timestamptz | no | |

Constraints:
- UNIQUE (store_id, sku): store-level SKU uniqueness (BRD BR-VARIANT-003); NULLs allowed.
- CHECK (price >= 0), CHECK (compare_at_price >= 0), CHECK (cost_price >= 0).

Notes:
- Inventory belongs to the variant, never the product.
- Simple products use a single Default ProductVariant.
- ACTIVE = purchasable; ARCHIVED = not added to new carts; historical orders unchanged.

## 7.7 categories

**Purpose:** Catalog classification. Flat in the MVP (no parent/child hierarchy).
**Ownership:** Direct store ownership.
**PK:** id.

| Column | Type | Null | Constraints / Notes |
|---|---|---|---|
| id | uuid | no | PK |
| store_id | uuid | no | FK stores |
| name | text | no | |
| slug | text | no | UNIQUE within store |
| description | text | yes | |
| status | category_status | no | DEFAULT 'ACTIVE'; ACTIVE/ARCHIVED |
| created_at | timestamptz | no | |
| updated_at | timestamptz | no | |

Notes:
- Parent/child category hierarchy is DEFERRED (not an MVP domain model capability).
- ARCHIVED categories keep existing Product associations (historical data unchanged).

## 7.8 product_categories

**Purpose:** N:M link between Products and Categories (FINALIZED cardinality — never 1:N).
**Ownership:** Direct store ownership.
**PK:** id.

| Column | Type | Null | Constraints / Notes |
|---|---|---|---|
| id | uuid | no | PK |
| store_id | uuid | no | FK stores |
| product_id | uuid | no | FK products; composite FK (store_id, product_id) |
| category_id | uuid | no | FK categories; composite FK (store_id, category_id) |
| created_at | timestamptz | no | |

Constraints:
- UNIQUE (product_id, category_id): a given pair is never duplicated.
- Composite FKs to products and categories guarantee all links stay within the same Store.

## 7.9 inventory

**Purpose:** Current stock state of one ProductVariant (1:1).
**Ownership:** Direct store ownership (through variant).
**PK:** id.

| Column | Type | Null | Constraints / Notes |
|---|---|---|---|
| id | uuid | no | PK |
| store_id | uuid | no | FK stores |
| variant_id | uuid | no | FK product_variants; UNIQUE (1:1) |
| on_hand_quantity | integer | no | CHECK (on_hand_quantity >= 0) |
| reserved_quantity | integer | no | DEFAULT 0; CHECK (reserved_quantity >= 0) |
| created_at | timestamptz | no | |
| updated_at | timestamptz | no | |

Invariant (FINALIZED):

```text
available = on_hand_quantity - reserved_quantity
CHECK (on_hand_quantity >= reserved_quantity)  -- guarantees available >= 0
```

Notes:
- `available` is derived, never stored; no drift is possible.
- All mutation is via atomic conditional UPDATEs (Section 13).
- No optimistic-lock column is required for the transactional reservation path (Section 26).

## 7.10 inventory_reservations

**Purpose:** Temporary inventory reservation during the checkout/order lifecycle.
**Ownership:** Direct store ownership (through variant).
**PK:** id.

| Column | Type | Null | Constraints / Notes |
|---|---|---|---|
| id | uuid | no | PK |
| store_id | uuid | no | FK stores |
| variant_id | uuid | no | FK product_variants; composite FK (store_id, variant_id) |
| cart_id | uuid | yes | FK carts ON DELETE SET NULL (checkout context) |
| order_id | uuid | yes | FK orders ON DELETE SET NULL (set at order creation) |
| quantity | integer | no | CHECK (quantity > 0) |
| status | reservation_status | no | DEFAULT 'ACTIVE'; FINALIZED lifecycle |
| expires_at | timestamptz | yes | reservation expiration bound |
| released_at | timestamptz | yes | set when status becomes RELEASED |
| consumed_at | timestamptz | yes | set when status becomes CONSUMED |
| created_at | timestamptz | no | |
| updated_at | timestamptz | no | |

Constraints:
- CHECK (cart_id IS NOT NULL OR order_id IS NOT NULL): every reservation has a checkout or order context. Cart cleanup must release ACTIVE reservations before purging the cart.
- CHECK (quantity > 0).

Lifecycle (FINALIZED, exactly):

```text
ACTIVE -> CONSUMED   (verified payment success)
ACTIVE -> RELEASED   (payment failure, order cancellation, OR expiration)
```

- EXPIRED is NOT a state; expiration is a reason/path resulting in RELEASED.
- CONVERTED is NOT a state. No two-phase reservation lifecycle.
- Release and consumption are idempotent (conditional status transition, Section 14).

## 7.11 inventory_movements

**Purpose:** Immutable audit record of every inventory change.
**Ownership:** Direct store ownership (through variant).
**PK:** id.

| Column | Type | Null | Constraints / Notes |
|---|---|---|---|
| id | uuid | no | PK |
| store_id | uuid | no | FK stores |
| variant_id | uuid | no | FK product_variants; composite FK (store_id, variant_id) |
| movement_type | movement_type | no | INITIAL_STOCK / ADJUSTMENT / SALE / RESERVATION / CONSUMPTION / RELEASE (technical) |
| quantity | integer | no | signed delta (see Section 13.5 for target counter) |
| reference_type | text | yes | e.g., 'order', 'reservation', 'adjustment' |
| reference_id | uuid | yes | id of the referenced record |
| reason | text | yes | merchant-provided reason for adjustments |
| on_hand_after | integer | no | post-change snapshot |
| reserved_after | integer | no | post-change snapshot |
| created_at | timestamptz | no | |

Notes:
- Append-only; rows are never updated or deleted.
- Every manual inventory adjustment produces a movement (BRD BR-INVENTORY-002).
- Snapshot columns make movements self-contained audit records.

## 7.12 customers

**Purpose:** A customer who purchases from a Store. Accounts are OPTIONAL (guest checkout supported).
**Ownership:** Direct store ownership.
**PK:** id.

| Column | Type | Null | Constraints / Notes |
|---|---|---|---|
| id | uuid | no | PK |
| store_id | uuid | no | FK stores |
| email | text | yes | UNIQUE within store (when present); NULLs allowed |
| phone | text | yes | |
| first_name | text | no | |
| last_name | text | no | |
| auth_user_id | uuid | yes | reserved for future customer authentication (NOT an MVP auth requirement) |
| created_at | timestamptz | no | |
| updated_at | timestamptz | no | |

Notes:
- The same person in different Stores is a different Customer (Store-scoped).
- A Customer record may be created during checkout even for guests.
- NO lifecycle status column: the domain model defines no customer lifecycle.
- Customer identity and merchant authentication identity are conceptually separate.

## 7.13 customer_addresses

**Purpose:** Reusable customer addresses.
**Ownership:** Direct store ownership (through customer).
**PK:** id.

| Column | Type | Null | Constraints / Notes |
|---|---|---|---|
| id | uuid | no | PK |
| store_id | uuid | no | FK stores |
| customer_id | uuid | no | FK customers ON DELETE CASCADE; composite FK (store_id, customer_id) |
| label | text | yes | e.g., "Home", "Work" |
| first_name | text | no | |
| last_name | text | no | |
| phone | text | yes | |
| country | text | yes | |
| governorate | text | yes | |
| city | text | no | |
| address_line | text | no | |
| building | text | yes | |
| apartment | text | yes | |
| postal_code | text | yes | |
| is_default | boolean | no | DEFAULT false |
| created_at | timestamptz | no | |
| updated_at | timestamptz | no | |

Notes:
- Historical orders NEVER depend on current `customer_addresses` rows (orders snapshot their own shipping data).
- Optional: partial UNIQUE (customer_id) WHERE is_default (one default per customer) — technical decision.

## 7.14 carts

**Purpose:** Persistent shopping session. Authenticated-customer or guest carts are supported.
**Ownership:** Direct store ownership.
**PK:** id.

| Column | Type | Null | Constraints / Notes |
|---|---|---|---|
| id | uuid | no | PK |
| store_id | uuid | no | FK stores |
| customer_id | uuid | yes | FK customers ON DELETE SET NULL (authenticated cart) |
| guest_token | text | yes | opaque random token; no business information |
| status | cart_status | no | DEFAULT 'ACTIVE'; ACTIVE/EXPIRED (+ COMPLETED technical) |
| currency | char(3) | no | DEFAULT store currency (EGP) |
| expires_at | timestamptz | yes | cart expiration bound |
| completed_at | timestamptz | yes | set when a checkout completes |
| created_at | timestamptz | no | |
| updated_at | timestamptz | no | |

Constraints:
- CHECK (customer_id IS NOT NULL OR guest_token IS NOT NULL): exactly one identity path.
- Partial UNIQUE (store_id, guest_token) WHERE guest_token IS NOT NULL.
- Recommended partial UNIQUE (store_id, customer_id) WHERE status = 'ACTIVE' (one active cart per customer) — technical decision.

Notes:
- Guest cart creation does NOT require authentication.
- Cart pricing is NOT authoritative; checkout revalidates everything.
- No cart merging, no abandoned-cart recovery, no guest/customer merge in the MVP.
- A COMPLETED cart is never reused for a new checkout.
- Cart rows are retained (temporary entities for retention purposes, Section 25).

## 7.15 cart_items

**Purpose:** A ProductVariant + quantity in a Cart.
**Ownership:** Inherited through carts (no store_id column).
**PK:** id.

| Column | Type | Null | Constraints / Notes |
|---|---|---|---|
| id | uuid | no | PK |
| cart_id | uuid | no | FK carts ON DELETE CASCADE |
| variant_id | uuid | no | FK product_variants ON DELETE RESTRICT |
| quantity | integer | no | CHECK (quantity > 0) |
| created_at | timestamptz | no | |
| updated_at | timestamptz | no | |

Constraints:
- UNIQUE (cart_id, variant_id): one line per variant per cart (add merges quantity).
- CartItem references a ProductVariant (never a bare Product).
- RLS resolves the Store through the parent cart.

## 7.16 orders

**Purpose:** A completed checkout order.
**Ownership:** Direct store ownership.
**PK:** id.

| Column | Type | Null | Constraints / Notes |
|---|---|---|---|
| id | uuid | no | PK |
| store_id | uuid | no | FK stores |
| order_number | text | no | human-readable; UNIQUE within store (e.g., ORD-2026-000001) |
| customer_id | uuid | yes | FK customers ON DELETE SET NULL |
| status | order_status | no | DEFAULT 'PENDING'; FINALIZED domain lifecycle |
| currency | char(3) | no | ISO 4217 |
| subtotal | bigint | no | integer minor units; CHECK >= 0 |
| discount_total | bigint | no | DEFAULT 0; reserved for future discounting (MVP discount engine out of scope) |
| shipping_total | bigint | no | CHECK >= 0 |
| tax_total | bigint | no | CHECK >= 0 |
| grand_total | bigint | no | CHECK (grand_total = subtotal - discount_total + shipping_total + tax_total) |
| customer_email | text | yes | purchase-time snapshot |
| customer_phone | text | yes | purchase-time snapshot |
| shipping_address_snapshot | jsonb | no | purchase-time shipping data |
| billing_address_snapshot | jsonb | yes | purchase-time billing data |
| idempotency_key | text | yes | checkout idempotency; UNIQUE within store (when present) |
| created_at | timestamptz | no | |
| updated_at | timestamptz | no | |
| confirmed_at | timestamptz | yes | set on -> CONFIRMED |
| cancelled_at | timestamptz | yes | set on -> CANCELLED (auditable) |

Notes:
- **NO `payment_status` column.** Order status and Payment status are separate state machines; payment state is read from the order's active payment record (Section 16).
- Fulfillment is represented by order status (PROCESSING -> SHIPPED -> DELIVERED); there is NO separate fulfillment state machine.
- Order numbers are unique per Store; the internal UUID remains the immutable primary key.

## 7.17 order_items

**Purpose:** Purchased variant with purchase-time snapshots.
**Ownership:** Inherited through orders (no store_id column).
**PK:** id.

| Column | Type | Null | Constraints / Notes |
|---|---|---|---|
| id | uuid | no | PK |
| order_id | uuid | no | FK orders ON DELETE CASCADE |
| product_id | uuid | yes | FK products ON DELETE SET NULL (referential link only) |
| variant_id | uuid | yes | FK product_variants ON DELETE SET NULL (referential link only) |
| product_name_snapshot | text | no | purchase-time product name |
| variant_name_snapshot | text | no | purchase-time variant name |
| sku_snapshot | text | yes | purchase-time SKU |
| unit_price | bigint | no | purchase-time price (integer minor units) |
| quantity | integer | no | CHECK (quantity > 0) |
| line_total | bigint | no | CHECK (line_total >= 0); unit_price * quantity |
| created_at | timestamptz | no | |

Notes:
- Historical accuracy NEVER depends on current product/variant rows. Changing product name/price, variant SKU, archiving, or deleting a product must NOT rewrite historical order items.
- `product_id`/`variant_id` are informational referential links with ON DELETE SET NULL as a safety net; physical deletion of products/variants with order history is prohibited by retention policy (Section 25).

## 7.18 payments

**Purpose:** Provider-agnostic payment record for an Order.
**Ownership:** Direct store ownership.
**PK:** id.

| Column | Type | Null | Constraints / Notes |
|---|---|---|---|
| id | uuid | no | PK |
| store_id | uuid | no | FK stores |
| order_id | uuid | no | FK orders ON DELETE RESTRICT; composite FK (store_id, order_id) |
| status | payment_status | no | DEFAULT 'PENDING'; FINALIZED domain lifecycle |
| provider | text | no | provider name, e.g., 'paymob' (provider abstraction) |
| provider_reference | text | yes | provider payment/transaction id; UNIQUE per provider (when present) |
| amount | bigint | no | integer minor units; CHECK (amount > 0) |
| currency | char(3) | no | ISO 4217 |
| idempotency_key | text | yes | payment initiation idempotency; UNIQUE within store (when present) |
| failure_code | text | yes | |
| failure_message | text | yes | |
| created_at | timestamptz | no | |
| updated_at | timestamptz | no | |

Notes:
- Order 1:N Payment: after a failed payment, a new Payment may be created for the same Order. The **active payment** is the most recently created one; its status is the authoritative payment state.
- Provider-agnostic: Paymob-specific fields never appear here; provider adapters map payloads into this schema.
- Payment success may cause the Order transition PENDING -> CONFIRMED (once, idempotently). It never implies fulfillment.

## 7.19 payment_attempts

**Purpose:** An individual attempt to pay an Order.
**Ownership:** Inherited through payments (no store_id column).
**PK:** id.

| Column | Type | Null | Constraints / Notes |
|---|---|---|---|
| id | uuid | no | PK |
| payment_id | uuid | no | FK payments ON DELETE CASCADE |
| status | payment_status | no | DEFAULT 'PENDING' |
| provider_reference | text | yes | attempt-level provider session/transaction reference |
| idempotency_key | text | yes | UNIQUE within the parent payment (when present) |
| amount | bigint | no | integer minor units; CHECK (amount > 0) |
| currency | char(3) | no | |
| failure_code | text | yes | |
| failure_message | text | yes | |
| initiated_at | timestamptz | yes | |
| completed_at | timestamptz | yes | |
| created_at | timestamptz | no | |
| updated_at | timestamptz | no | |

Notes:
- A failed attempt NEVER creates a second Order automatically.
- Payment initiation is idempotent: retrying with the same idempotency key returns the same attempt.
- RLS resolves the Store through the parent payment.

## 7.20 payment_events

**Purpose:** Raw provider webhook/event log. A verified provider event is the authority for payment confirmation.
**Ownership:** Direct store ownership (nullable until the payment is resolved).
**PK:** id.

| Column | Type | Null | Constraints / Notes |
|---|---|---|---|
| id | uuid | no | PK |
| store_id | uuid | yes | NULL until the payment is resolved; set before tenant-visible processing |
| payment_id | uuid | yes | FK payments ON DELETE SET NULL |
| provider | text | no | |
| provider_event_id | text | no | UNIQUE per provider (deduplication) |
| event_type | text | no | provider event type |
| payload | jsonb | no | raw provider payload |
| signature_verified | boolean | no | DEFAULT false |
| processing_status | event_processing_status | no | DEFAULT 'RECEIVED'; RECEIVED/PROCESSED/ERROR (technical) |
| error_message | text | yes | |
| processed_at | timestamptz | yes | |
| created_at | timestamptz | no | |

Notes:
- UNIQUE (provider, provider_event_id) guarantees webhook deduplication.
- Processing is idempotent and safe to retry (guarded transitions, Section 27).
- A browser redirect alone is NEVER treated as authoritative payment confirmation.
- RLS: rows with store_id NULL are internal-only (invisible to tenant policies).

## 7.21 pages

**Purpose:** A public Store page (Home, About, Contact, FAQ).
**Ownership:** Direct store ownership.
**PK:** id.

| Column | Type | Null | Constraints / Notes |
|---|---|---|---|
| id | uuid | no | PK |
| store_id | uuid | no | FK stores |
| title | text | no | |
| slug | text | no | UNIQUE within store |
| status | page_status | no | DEFAULT 'DRAFT'; DRAFT/PUBLISHED/ARCHIVED |
| seo_title | text | yes | |
| seo_description | text | yes | |
| created_at | timestamptz | no | |
| updated_at | timestamptz | no | |

## 7.22 page_sections

**Purpose:** Configurable section within a Page.
**Ownership:** Direct store ownership (through page).
**PK:** id.

| Column | Type | Null | Constraints / Notes |
|---|---|---|---|
| id | uuid | no | PK |
| store_id | uuid | no | FK stores |
| page_id | uuid | no | FK pages ON DELETE CASCADE; composite FK (store_id, page_id) |
| section_type | text | no | hero / banner / featured_products / category_grid / text / image |
| content | jsonb | no | section configuration / structured content |
| sort_order | integer | no | DEFAULT 0; section ordering |
| created_at | timestamptz | no | |
| updated_at | timestamptz | no | |

## 7.23 navigations

**Purpose:** Storefront navigation configuration.
**Ownership:** Direct store ownership.
**PK:** id.

| Column | Type | Null | Constraints / Notes |
|---|---|---|---|
| id | uuid | no | PK |
| store_id | uuid | no | FK stores |
| name | text | no | menu label, e.g., "Main" |
| items | jsonb | no | ordered items referencing Pages, Categories, or destinations (label + slug/id) |
| created_at | timestamptz | no | |
| updated_at | timestamptz | no | |

Notes:
- Navigation items are storefront configuration, not core commerce data; JSONB is acceptable (Section 21).

## 7.24 theme_configurations

**Purpose:** Store visual configuration (logo, colors, typography, layout). 1:1 with Store.
**Ownership:** Direct store ownership.
**PK:** id.

| Column | Type | Null | Constraints / Notes |
|---|---|---|---|
| id | uuid | no | PK |
| store_id | uuid | no | FK stores; UNIQUE (1:1) |
| logo_media_id | uuid | yes | FK media ON DELETE SET NULL; store logo reference |
| config | jsonb | no | colors, typography, basic layout settings |
| created_at | timestamptz | no | |
| updated_at | timestamptz | no | |

Notes:
- Created automatically with the Store (default theme).
- The MVP has NO visual page-builder domain; theme is configuration-driven.

## 7.25 media

**Purpose:** Metadata record for a stored media asset (product image, store logo, CMS image).
**Ownership:** Direct store ownership.
**PK:** id.

| Column | Type | Null | Constraints / Notes |
|---|---|---|---|
| id | uuid | no | PK |
| store_id | uuid | no | FK stores |
| storage_path | text | no | Supabase Storage object path (recommended UNIQUE within store) |
| media_type | media_type | no | IMAGE / VIDEO / FILE (technical) |
| mime_type | text | yes | |
| size_bytes | bigint | yes | CHECK (size_bytes >= 0) |
| alt_text | text | yes | |
| created_at | timestamptz | no | |

Notes:
- Binary content lives in Supabase Storage; this table stores metadata + references only.
- Tenant isolation: a merchant can never access another Store's media (RLS + Supabase Storage policies).

## 7.26 product_media

**Purpose:** Association of Media to Products (product images), ordered.
**Ownership:** Direct store ownership.
**PK:** id.

| Column | Type | Null | Constraints / Notes |
|---|---|---|---|
| id | uuid | no | PK |
| store_id | uuid | no | FK stores |
| product_id | uuid | no | FK products ON DELETE CASCADE; composite FK (store_id, product_id) |
| media_id | uuid | no | FK media ON DELETE RESTRICT; composite FK (store_id, media_id) |
| variant_id | uuid | yes | FK product_variants ON DELETE CASCADE (variant-specific images) |
| alt_text | text | yes | contextual alt text |
| sort_order | integer | no | DEFAULT 0 |
| created_at | timestamptz | no | |

Constraints:
- UNIQUE (product_id, media_id).

## 7.27 store_settings

**Purpose:** Store-level operational configuration (supporting/technical table).
**Ownership:** Direct store ownership.
**PK:** id.

| Column | Type | Null | Constraints / Notes |
|---|---|---|---|
| id | uuid | no | PK |
| store_id | uuid | no | FK stores; UNIQUE (1:1) |
| settings | jsonb | no | non-critical operational configuration |
| created_at | timestamptz | no | |
| updated_at | timestamptz | no | |

Notes:
- Critical business data (prices, inventory, orders, payments, statuses) is NEVER hidden inside JSONB.
- Only non-critical operational settings belong here.

## 7.28 audit_logs

**Purpose:** Immutable record of auditable administrative actions.
**Ownership:** Direct store ownership.
**PK:** id.

| Column | Type | Null | Constraints / Notes |
|---|---|---|---|
| id | uuid | no | PK |
| store_id | uuid | no | FK stores |
| user_id | uuid | yes | FK users ON DELETE SET NULL (actor) |
| action | text | no | e.g., product.updated, inventory.adjusted, order.cancelled |
| entity_type | text | no | target entity name |
| entity_id | uuid | yes | target entity identifier |
| metadata | jsonb | yes | relevant contextual data |
| created_at | timestamptz | no | |

Notes:
- Append-only; never updated or deleted.
- Covers: product create/update, inventory adjustment, order status change (incl. cancellation), store configuration change, membership/permission change, payment events.

---

# 8. Primary Keys

- Every table uses a surrogate `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`.
- UUIDs prevent enumeration and simplify future sharding/merging.
- Human-readable identifiers are separate business fields, never primary keys:
  - stores.slug (public storefront URL)
  - products.slug, categories.slug, pages.slug (SEO URLs)
  - product_variants.sku (merchant identifier)
  - orders.order_number (e.g., ORD-2026-000001)
  - payment_events.provider_event_id (provider event dedup)
- Natural keys are UNIQUE-constrained (Section 10) but never PKs.
- Parent tables additionally expose UNIQUE (store_id, id) as composite-FK targets (Section 9).
- The internal UUID is immutable; customer-facing references use the human-readable identifiers.

---

# 9. Foreign Keys

## 9.1 Composite store-scoped FK pattern

For every tenant table that carries both `store_id` and a parent FK, the parent FK is COMPOSITE:

```text
FOREIGN KEY (store_id, parent_id) REFERENCES parent (store_id, id)
```

Backed by `UNIQUE (store_id, id)` on the parent. This makes it impossible at the database level for a child row to reference a parent in a different Store.

Parent tables requiring `UNIQUE (store_id, id)` as FK targets: products, product_variants, categories, customers, orders, pages, media.

## 9.2 Complete FK inventory

| Child table | FK columns | References | ON DELETE |
|---|---|---|---|
| users.auth_user_id | — | Supabase auth.users (external; no DB FK) | — |
| store_memberships | store_id | stores(id) | RESTRICT |
| store_memberships | user_id | users(id) | RESTRICT |
| subscriptions | store_id | stores(id) | RESTRICT |
| products | store_id | stores(id) | RESTRICT |
| product_variants | store_id, product_id | stores(id), products(id, store_id) | RESTRICT / CASCADE |
| categories | store_id | stores(id) | RESTRICT |
| product_categories | store_id, product_id | stores(id), products(id, store_id) | RESTRICT / CASCADE |
| product_categories | store_id, category_id | stores(id), categories(id, store_id) | RESTRICT / CASCADE |
| inventory | store_id, variant_id | stores(id), product_variants(id, store_id) | RESTRICT / CASCADE |
| inventory_reservations | store_id, variant_id | stores(id), product_variants(id, store_id) | RESTRICT / RESTRICT |
| inventory_reservations | cart_id | carts(id) | SET NULL |
| inventory_reservations | order_id | orders(id) | SET NULL |
| inventory_movements | store_id, variant_id | stores(id), product_variants(id, store_id) | RESTRICT / RESTRICT |
| customers | store_id | stores(id) | RESTRICT |
| customer_addresses | store_id, customer_id | stores(id), customers(id, store_id) | RESTRICT / CASCADE |
| carts | store_id | stores(id) | RESTRICT |
| carts | customer_id | customers(id) | SET NULL |
| cart_items | cart_id | carts(id) | CASCADE |
| cart_items | variant_id | product_variants(id) | RESTRICT |
| orders | store_id | stores(id) | RESTRICT |
| orders | customer_id | customers(id) | SET NULL |
| order_items | order_id | orders(id) | CASCADE |
| order_items | product_id | products(id) | SET NULL |
| order_items | variant_id | product_variants(id) | SET NULL |
| payments | store_id, order_id | stores(id), orders(id, store_id) | RESTRICT / RESTRICT |
| payment_attempts | payment_id | payments(id) | CASCADE |
| payment_events | store_id | stores(id) | RESTRICT |
| payment_events | payment_id | payments(id) | SET NULL |
| pages | store_id | stores(id) | RESTRICT |
| page_sections | store_id, page_id | stores(id), pages(id, store_id) | RESTRICT / CASCADE |
| navigations | store_id | stores(id) | RESTRICT |
| theme_configurations | store_id | stores(id) | RESTRICT |
| theme_configurations | logo_media_id | media(id) | SET NULL |
| media | store_id | stores(id) | RESTRICT |
| product_media | store_id, product_id | stores(id), products(id, store_id) | RESTRICT / CASCADE |
| product_media | store_id, media_id | stores(id), media(id, store_id) | RESTRICT / RESTRICT |
| product_media | variant_id | product_variants(id) | CASCADE |
| store_settings | store_id | stores(id) | RESTRICT |
| audit_logs | store_id | stores(id) | RESTRICT |
| audit_logs | user_id | users(id) | SET NULL |

## 9.3 Delete-behavior rationale (summary)

- stores: never deleted; all FKs to stores are RESTRICT.
- products/variants/categories: physically deletable only when no commerce history exists; order_items use SET NULL as a safety net; inventory/reservation/movement children RESTRICT to make accidental deletion impossible.
- carts: temporary entities; cart_items CASCADE.
- customers: never deleted when order history exists; orders/carts use SET NULL as a safety net; addresses CASCADE.
- orders: never deleted; order_items CASCADE is a safety net; payments RESTRICT.
- payments: never deleted; attempts CASCADE, events SET NULL (events survive).

---

# 10. Unique Constraints

| Table | Unique constraint | Purpose |
|---|---|---|
| users | email | one account per email |
| users | auth_user_id | 1:1 with Supabase Auth identity |
| stores | slug | globally unique public URL |
| store_memberships | (store_id, user_id) | one membership per user per store |
| store_memberships | partial (store_id) WHERE role = 'OWNER' | at most one OWNER per store |
| subscriptions | store_id | 1:1 subscription |
| products | (store_id, slug) | per-store SEO URL uniqueness |
| product_variants | (store_id, sku) | per-store SKU uniqueness (BRD); multiple NULLs allowed |
| categories | (store_id, slug) | per-store SEO URL uniqueness |
| product_categories | (product_id, category_id) | no duplicate links |
| inventory | variant_id | 1:1 inventory |
| customers | (store_id, email) | per-store email uniqueness; multiple NULLs allowed |
| carts | partial (store_id, guest_token) WHERE guest_token IS NOT NULL | guest cart identity |
| cart_items | (cart_id, variant_id) | one line per variant per cart |
| orders | (store_id, order_number) | human-readable order number per store |
| orders | partial (store_id, idempotency_key) WHERE idempotency_key IS NOT NULL | checkout idempotency |
| payments | partial (store_id, idempotency_key) WHERE idempotency_key IS NOT NULL | payment initiation idempotency |
| payments | partial (provider, provider_reference) WHERE provider_reference IS NOT NULL | no double use of a provider payment |
| payment_attempts | partial (payment_id, idempotency_key) WHERE idempotency_key IS NOT NULL | attempt idempotency |
| payment_events | (provider, provider_event_id) | webhook deduplication |
| pages | (store_id, slug) | per-store page URL uniqueness |
| theme_configurations | store_id | 1:1 theme |
| store_settings | store_id | 1:1 settings |
| product_media | (product_id, media_id) | no duplicate image links |

All unique constraints are implemented as unique indexes; they double as query indexes.

---

# 11. Index Strategy

Every index below exists for a concrete access pattern. Avoid speculative indexes; add more only from measured queries.

| Table | Index | Purpose |
|---|---|---|
| users | auth_user_id (unique) | session -> user lookup |
| users | email (unique) | identity lookup |
| stores | slug (unique) | storefront URL -> store resolution |
| stores | status | admin store lists / access-overlay scans |
| store_memberships | (store_id) | members of a store (FK + RLS) |
| store_memberships | (user_id) | stores a user belongs to |
| store_memberships | (store_id, user_id) unique | membership lookup (unique index already) |
| store_memberships | partial (store_id) WHERE role = 'OWNER' | single-owner enforcement |
| subscriptions | store_id (unique) | 1:1 lookup |
| subscriptions | status | expiry sweeps / access-overlay checks |
| products | (store_id) | all tenant queries (RLS + FK) |
| products | (store_id, slug) unique | storefront product-by-slug |
| products | (store_id, status) | storefront (ACTIVE) + admin filtering |
| product_variants | (product_id) | variants of a product |
| product_variants | (store_id, sku) unique | SKU lookup (admin, API) |
| product_variants | (store_id, status) | purchasable-variant filtering |
| categories | (store_id, slug) unique | storefront category-by-slug |
| product_categories | (category_id) | storefront: products in a category |
| product_categories | (product_id) | admin: categories of a product |
| inventory | variant_id (unique) | variant -> inventory lookup (every checkout) |
| inventory_reservations | (store_id, status, expires_at) | expiration sweep (ACTIVE + expiry scan) |
| inventory_reservations | (variant_id) | reservation tally per variant (FK) |
| inventory_reservations | (order_id) | release on cancellation / payment outcome |
| inventory_movements | (variant_id, created_at) | inventory history listing |
| customers | (store_id, email) unique | customer lookup by email |
| customers | (store_id) | admin listing/search (RLS) |
| customer_addresses | (customer_id) | addresses of a customer |
| carts | (store_id, guest_token) unique | guest cart lookup by token |
| carts | (store_id, customer_id) | authenticated cart lookup |
| carts | (store_id, status, expires_at) | cart expiration sweep |
| cart_items | (cart_id) | items of a cart |
| cart_items | (cart_id, variant_id) unique | line dedup |
| orders | (store_id, created_at DESC) | order list (dashboard default sort) |
| orders | (store_id, order_number) unique | order lookup by human number |
| orders | (store_id, status) | status-filtered admin lists |
| orders | (store_id, customer_id) | customer order history |
| orders | (store_id, idempotency_key) unique | checkout idempotency |
| order_items | (order_id) | items of an order |
| payments | (order_id) | payments of an order |
| payments | (store_id, idempotency_key) unique | payment initiation idempotency |
| payments | (provider, provider_reference) unique | provider reconciliation |
| payment_attempts | (payment_id) | attempts of a payment |
| payment_events | (provider, provider_event_id) unique | webhook dedup (critical) |
| payment_events | (store_id, created_at) | tenant event history |
| payment_events | (processing_status) partial | webhook retry/reprocessing scan |
| pages | (store_id, slug) unique | storefront page-by-slug |
| page_sections | (page_id) | sections of a page |
| media | (store_id) | tenant media library |
| product_media | (product_id) | product images |
| theme_configurations | store_id (unique) | 1:1 lookup |
| audit_logs | (store_id, created_at) | tenant audit history |

Not required in the MVP: free-text/advanced search indexes (MVP search is name-based), global (non-store) indexes on any tenant table, aggregate/reporting indexes.

---

# 12. Enum / Status Definitions

Postgres native ENUM vs TEXT + CHECK is a technical implementation decision (Section 33). The values below are authoritative.

## 12.1 Domain enums (FINALIZED — MUST match DOMAIN-MODEL.md exactly)

| Enum | Values | Used on |
|---|---|---|
| store_status | ACTIVE, DISABLED, SUSPENDED | stores.status |
| subscription_status | TRIAL, ACTIVE, EXPIRED | subscriptions.status |
| membership_role | OWNER, ADMIN, STAFF | store_memberships.role |
| product_status | DRAFT, ACTIVE, ARCHIVED | products.status |
| variant_status | ACTIVE, ARCHIVED | product_variants.status |
| category_status | ACTIVE, ARCHIVED | categories.status |
| reservation_status | ACTIVE, CONSUMED, RELEASED | inventory_reservations.status |
| order_status | PENDING, CONFIRMED, PROCESSING, SHIPPED, DELIVERED, CANCELLED | orders.status |
| payment_status | PENDING, PROCESSING, SUCCEEDED, FAILED | payments.status, payment_attempts.status |
| cart_status | ACTIVE, EXPIRED, COMPLETED | carts.status |
| page_status | DRAFT, PUBLISHED, ARCHIVED | pages.status |

## 12.2 State machines (domain rules)

Order (separate from Payment):

```text
PENDING -> CONFIRMED -> PROCESSING -> SHIPPED -> DELIVERED
CANCELLED only from PENDING or CONFIRMED (terminal, auditable)
```

Payment (separate from Order):

```text
PENDING -> PROCESSING -> SUCCEEDED
PENDING -> PROCESSING -> FAILED
```

Reservation:

```text
ACTIVE -> CONSUMED   (verified payment success)
ACTIVE -> RELEASED   (payment failure, order cancellation, or expiration)
```

Store: ACTIVE, DISABLED, SUSPENDED (no enforced transitions in the MVP DB; application-level semantics).
Subscription: TRIAL -> ACTIVE, TRIAL -> EXPIRED, ACTIVE -> EXPIRED, EXPIRED -> ACTIVE.

## 12.3 Technical enums (implementation labels; NOT domain lifecycle states)

| Enum | Values | Used on |
|---|---|---|
| membership_status | ACTIVE, INACTIVE | store_memberships.status |
| movement_type | INITIAL_STOCK, ADJUSTMENT, SALE, RESERVATION, CONSUMPTION, RELEASE | inventory_movements.movement_type |
| event_processing_status | RECEIVED, PROCESSED, ERROR | payment_events.processing_status |
| media_type | IMAGE, VIDEO, FILE | media.media_type |

Notes:
- `cart_status.COMPLETED` is a technical status for a cart fulfilled by a completed checkout; the domain model delegates this representation to the database layer. It is NOT a domain lifecycle state.
- `membership_status.INACTIVE` represents a revoked/deactivated membership (technical representation of removal).
- `movement_type` values are technical labels for the immutable inventory audit trail.

## 12.4 Status storage recommendation

- Domain enums: Postgres native ENUM or TEXT + CHECK with the exact values above. If TEXT + CHECK, values are stored UPPERCASE.
- Transition validation (e.g., no skipping PENDING -> SHIPPED) is enforced by the application state machine; DB CHECK constraints validate enum membership, not transitions. DB-trigger transition guards are optional defense-in-depth (Section 33).

---

# 13. Inventory Data Model

## 13.1 Ownership

Inventory belongs to a ProductVariant (never a Product). It is Store-scoped through the variant.

## 13.2 Quantities and invariants

- `on_hand_quantity`: physical stock count (INTEGER, >= 0).
- `reserved_quantity`: stock committed to ACTIVE reservations (INTEGER, >= 0, default 0).
- `available = on_hand_quantity - reserved_quantity` (derived; never stored).
- `CHECK (on_hand_quantity >= reserved_quantity)` guarantees available >= 0 at the database level.

## 13.3 Mutation rules (all concurrency-safe)

(1) Manual adjustment / stock in:

```sql
UPDATE inventory
   SET on_hand_quantity = on_hand_quantity + :delta, updated_at = now()
 WHERE variant_id = :variant_id AND on_hand_quantity + :delta >= 0;
```

Zero rows affected -> rejected (would go negative). A matching inventory_movements row (INITIAL_STOCK/ADJUSTMENT) is written in the same transaction.

(2) Reservation (checkout, before payment initiation):

```sql
UPDATE inventory
   SET reserved_quantity = reserved_quantity + :qty, updated_at = now()
 WHERE variant_id = :variant_id
   AND on_hand_quantity - reserved_quantity >= :qty;
```

Zero rows affected -> insufficient stock (no reservation is created). The ACTIVE inventory_reservations row is inserted in the same transaction.

(3) Consumption (verified payment success):

```sql
UPDATE inventory
   SET on_hand_quantity = on_hand_quantity - :qty,
       reserved_quantity = reserved_quantity - :qty,
       updated_at = now()
 WHERE variant_id = :variant_id;
```

(4) Release (payment failure / cancellation / expiration):

```sql
UPDATE inventory
   SET reserved_quantity = reserved_quantity - :qty, updated_at = now()
 WHERE variant_id = :variant_id;
```

All four operations are single-statement atomic updates with a WHERE availability guard. **No read-then-write availability decision is ever used.**

## 13.4 Transactional boundaries

Every inventory change is committed in the same transaction as its business cause (Section 28):
- reservation -> checkout transaction
- consumption -> payment-success transaction
- release -> payment-failure / cancellation / expiration-sweep transaction
- adjustment -> admin adjustment transaction (includes the movement row)

## 13.5 Movements

- Every manual adjustment writes an inventory_movements row (BRD BR-INVENTORY-002).
- Movement rows are immutable and include `on_hand_after` / `reserved_after` snapshots.
- Movement type semantics:
  - INITIAL_STOCK / ADJUSTMENT: signed delta to on_hand_quantity.
  - RESERVATION: +delta to reserved_quantity.
  - CONSUMPTION: on_hand -delta and reserved -delta.
  - RELEASE: reserved -delta.
  - SALE: reserved for direct on_hand sales paths (not required by the MVP reservation flow).

## 13.6 What is NOT in the MVP

No multi-location inventory, no warehouses, no purchase orders, no suppliers, no stock transfers, no backorders, no pre-orders. These require future tables.

---

# 14. Reservation Data Model

## 14.1 Lifecycle (FINALIZED)

```text
ACTIVE -> CONSUMED   (verified provider webhook: payment SUCCEEDED)
ACTIVE -> RELEASED   (payment FAILED, order CANCELLED, or expiration)
```

- EXPIRED is NOT a state. Expiration is a reason/path whose terminal result is RELEASED.
- CONVERTED is NOT a state. There is NO two-phase reservation lifecycle.
- Reservation occurs during checkout BEFORE payment initiation.

## 14.2 Expiration mechanics

- `inventory_reservations.expires_at` bounds the ACTIVE lifetime (default is a configurable business parameter).
- Expired ACTIVE reservations are transitioned ACTIVE -> RELEASED idempotently by:
  - lazy evaluation when a reservation/order is accessed, and
  - a periodic in-monolith sweep job (no Redis/Kafka) using the index (store_id, status, expires_at).

## 14.3 Idempotent release / consumption

Both transitions are guarded so repeated execution is a no-op:

```sql
UPDATE inventory_reservations
   SET status = 'RELEASED', released_at = now(), updated_at = now()
 WHERE id = :reservation_id AND status = 'ACTIVE' AND store_id = :store_id;
```

Only when the UPDATE affects exactly one row is `inventory.reserved_quantity` decremented. A repeated call sees status != 'ACTIVE' and performs no decrement, so release/consumption is idempotent.

## 14.4 Context

- `cart_id`: checkout context (nullable; SET NULL on cart purge).
- `order_id`: set at order creation; afterwards it is the authoritative link for release/consumption on order outcomes.
- At least one of cart_id / order_id is always populated (CHECK constraint).

## 14.5 Retention

Reservation rows are NEVER deleted in the MVP; they are the audit trail of the reservation lifecycle. CONSUMED and RELEASED rows are retained indefinitely.

---

# 15. Order Data Model

## 15.1 Tables

- orders (Order aggregate root; Store-owned)
- order_items (OrderItem; inherited ownership)

## 15.2 Status machine

Exactly PENDING, CONFIRMED, PROCESSING, SHIPPED, DELIVERED, CANCELLED (Section 12).
- Normal path: PENDING -> CONFIRMED -> PROCESSING -> SHIPPED -> DELIVERED.
- No forward-state skipping; no arbitrary transitions.
- CANCELLED is terminal; allowed only from PENDING or CONFIRMED; audited (audit_logs action order.cancelled).
- Payment success may trigger the PENDING -> CONFIRMED transition exactly once (idempotent).

## 15.3 Historical integrity (snapshots)

OrderItem carries purchase-time snapshots — NEVER derived from current product/variant rows:
- product_name_snapshot, variant_name_snapshot, sku_snapshot, unit_price, quantity, line_total.

Orders snapshot checkout-time customer + address data:
- customer_email, customer_phone, shipping_address_snapshot (JSONB), billing_address_snapshot (JSONB).

Guarantees:
- Changing a Product name/price, Variant name/SKU, archiving or deleting a product NEVER rewrites historical orders.
- Historical orders remain correct even if the product is archived or removed.
- Current CustomerAddress records are irrelevant to historical orders.

## 15.4 Order number

- order_number (e.g., ORD-2026-000001) is unique per Store; generated by the application.
- The internal UUID is the immutable primary key and is never the primary customer-facing reference.

## 15.5 Money

All monetary columns are BIGINT integer minor units (BRD BR-VARIANT-002), consistent across products, orders, payments, shipping, taxes. For EGP the minor unit is the piastre.

## 15.6 Order/Payment separation

- orders has NO payment_status column.
- Payment state lives on the payment records (Section 16); order status and payment status are separate state machines.
- Order status never implies payment status and vice versa.

## 15.7 Idempotency

- orders.idempotency_key is UNIQUE per Store. A repeated checkout with the same key returns the existing order and creates NO duplicate order or duplicate reservations.

---

# 16. Payment Data Model

## 16.1 Tables

- payments (Payment; provider-agnostic aggregate)
- payment_attempts (PaymentAttempt; inherited ownership)
- payment_events (PaymentEvent; raw provider webhook log)

## 16.2 Provider abstraction

```text
Order domain -> Payment domain -> Provider Interface -> Provider Adapter -> Paymob
```

- The Order domain is never coupled to Paymob. Future providers (Fawry, COD, Stripe) plug into the same schema without redesigning orders.
- payments.provider stores the provider name; provider-specific payloads live in payment_events.payload and adapter mapping, never in Order columns.

## 16.3 Status machine

Exactly PENDING, PROCESSING, SUCCEEDED, FAILED (Section 12).
- PENDING -> PROCESSING -> SUCCEEDED, or PENDING -> PROCESSING -> FAILED.
- Order status != Payment status. Payment success may cause the approved Order transition to CONFIRMED; it never implies fulfillment.

## 16.4 Attempts and retries

- Order 1:N Payment; Payment 1:N PaymentAttempt.
- After a FAILED payment, a new Payment may be created for the same Order (retry). The active payment is the most recent one.
- A failed attempt NEVER creates a second Order automatically.
- Payment initiation is idempotent (payments.idempotency_key unique per Store; payment_attempts.idempotency_key unique per payment).

## 16.5 Webhook processing (idempotent, provider-agnostic)

1. Verify authenticity/signature.
2. Insert/claim a payment_events row (UNIQUE (provider, provider_event_id) prevents duplicate events).
3. Resolve the payment; set payment_events.store_id.
4. Apply guarded transitions idempotently:
   - SUCCEEDED: payment -> SUCCEEDED; reservations ACTIVE -> CONSUMED; order PENDING -> CONFIRMED.
   - FAILED: payment -> FAILED; reservations ACTIVE -> RELEASED.
5. Mark the event PROCESSED.

- Reprocessing a processed event re-applies the same guarded transitions without duplicate business effects.
- A browser redirect is NEVER authoritative; only a verified provider event is.

## 16.6 Immutability

Payments, attempts, and events are append/state-update only. History is never deleted.

---

# 17. Cart Data Model

## 17.1 Tables

- carts (Store-owned; ACTIVE/EXPIRED + COMPLETED technical status)
- cart_items (inherited ownership; variant + quantity lines)

## 17.2 Identity

- Authenticated customer cart: carts.customer_id (FK).
- Guest cart: carts.guest_token (opaque random token with no business information).
- CHECK (customer_id IS NOT NULL OR guest_token IS NOT NULL).
- Cart creation requires NO authentication.
- A Cart always belongs to exactly one Store.

## 17.3 Pricing

Cart pricing is NOT authoritative. Checkout revalidates: store status, product status, variant status, price, inventory availability, quantity, shipping, and totals — all server-side.

## 17.4 Lifecycle

- ACTIVE: usable.
- EXPIRED: no longer usable (expires_at + sweep/lazy evaluation; status EXPIRED).
- COMPLETED: cart fulfilled by a completed checkout (completed_at set); never reused for a new checkout. Technical status.
- No cart merging, no abandoned-cart recovery, no guest/customer merge in the MVP.
- The design remains future-compatible with cart recovery and abandoned-cart handling (rows retained; no destructive normalization).

## 17.5 Retention

Carts are temporary entities for retention purposes: expired/completed carts may be physically purged (cart_items CASCADE) after a retention window (technical decision, Section 33). ACTIVE reservations referencing the cart must be released BEFORE the cart is purged.

---

# 18. Customer Data Model

## 18.1 Tables

- customers (Store-owned; optional accounts)
- customer_addresses (Store-owned through customer)

## 18.2 Rules

- Customer accounts are OPTIONAL. Guest checkout is supported; a Customer is NOT required to create an Order.
- A Customer record may be created during checkout for merchant-side order management, even for guests.
- The same person in different Stores is a different Customer (Store-scoped).
- Customer identity and authentication identity are conceptually separate; customers.auth_user_id is reserved for future customer authentication.
- No customer lifecycle state machine in the MVP (no status column).
- UNIQUE (store_id, email) when email is present.

## 18.3 Addresses

- Reusable address book per customer.
- Orders NEVER depend on current address rows (they snapshot their own shipping/billing data).
- Optional partial unique index for one default address per customer (technical decision).

---

# 19. Membership Data Model

## 19.1 Table

- store_memberships (Store-owned access records)

## 19.2 Roles (FINALIZED)

Exactly OWNER, ADMIN, STAFF. The merchant who creates the Store is OWNER. No custom per-membership permission overrides.

## 19.3 Constraints

- UNIQUE (store_id, user_id): one membership per user per store.
- Partial UNIQUE (store_id) WHERE role = 'OWNER': at most one OWNER.
- membership_status ACTIVE/INACTIVE is a technical status for membership removal (soft, audited).

## 19.4 Access resolution

User -> StoreMembership (role) -> Store. The backend resolves tenant context from the authenticated user's valid ACTIVE membership. RLS mirrors this (Section 29).

---

# 20. Subscription Data Model

## 20.1 Table

- subscriptions (1:1 with Store; Store-owned)

## 20.2 Statuses (FINALIZED)

Exactly TRIAL, ACTIVE, EXPIRED.
Transitions: TRIAL -> ACTIVE, TRIAL -> EXPIRED, ACTIVE -> EXPIRED, EXPIRED -> ACTIVE.
No PAST_DUE / CANCELLED / SUSPENDED states.

## 20.3 Expiry behavior (access overlay, NOT a Store status)

- Dashboard -> read-only.
- Storefront -> disabled.
- Commerce data -> preserved; no automatic deletion.
- Reactivation: EXPIRED -> ACTIVE supported.
- Trial duration is a configurable business parameter (trial_started_at/trial_ends_at), not hard-coded.

## 20.4 Enforcement

Subscription state is enforced by the backend/authorization layer (the frontend is never trusted). No MVP billing/payment automation; invoices are future scope.

---

# 21. CMS Data Model

## 21.1 Tables

- pages (DRAFT/PUBLISHED/ARCHIVED)
- page_sections (ordered sections; JSONB content)
- navigations (storefront menus; JSONB items)
- theme_configurations (1:1 store; logo + visual config)
- store_settings (supporting/technical; JSONB operational settings)

## 21.2 Rules

- CMS entities are Store-scoped; never cross-tenant.
- Page/section/navigation/theme are presentation configuration, NOT core commerce data. JSONB is acceptable for content/items/config; critical business data (prices, inventory, orders, payments, statuses) must never be hidden inside generic JSONB.
- Pages carry SEO fields (seo_title, seo_description) per storefront SEO requirements.
- The MVP has no visual page-builder domain; sections are configuration-driven (hero, banner, featured_products, category_grid, text, image).
- Navigation items may reference Pages, Categories, and Storefront destinations (label + slug/id).
- theme_configurations.logo_media_id references media (store logo).

## 21.3 Deletion

- Draft-only pages/page_sections may be physically deleted.
- Published/archived pages and their sections are retained (archive status preserves history).
- Navigation/theme rows are current-state configuration: replaceable; historical versions are not required in the MVP (audit_logs cover administrative changes).

---

# 22. Media Data Model

## 22.1 Tables

- media (asset metadata; Store-owned)
- product_media (product <-> media association; ordered; optional variant_id)

## 22.2 Storage

- Binary content lives in Supabase Storage; the database stores metadata + storage_path references only.
- Media is Store-scoped: a merchant can never access another Store's media (RLS + Supabase Storage policies).

## 22.3 Usage

- Product images: product_media.
- Store logo: theme_configurations.logo_media_id.
- CMS images: referenced from page_sections content (JSONB) by media id/path.

## 22.4 Deletion

- media rows referenced by product_media or a logo are RESTRICT / SET NULL protected.
- Media without references may be deleted (metadata row + storage object).
- Historical media used by archived products is retained (product archives preserve their associations).

---

# 23. Audit Data Model

## 23.1 Table

- audit_logs (Store-owned; actor user_id nullable)

## 23.2 Coverage (MVP)

- Product created / updated / archived
- Inventory adjusted
- Order status changed (including cancellation)
- Payment events (provider event ingestion)
- Store configuration changed
- Membership / permission changed

## 23.3 Rules

- Append-only; rows are never updated or deleted.
- Records: actor, store, action, target entity, target id, timestamp, relevant metadata.
- Retention: retained indefinitely in the MVP (no auto-purge). Archival is future scope.

---

# 24. Historical Data Rules

## 24.1 Immutable records (never updated, never deleted)

- order_items (snapshots)
- order address/customer snapshots (JSONB on orders)
- inventory_movements
- payment_events
- payment_attempts (status transitions only; never deleted)
- payments (status transitions only; never deleted)
- audit_logs
- inventory_reservations (status transitions only; never deleted)

## 24.2 Snapshot requirements

| Mutable current data | Historical record that snapshots it |
|---|---|
| products.name, products.slug, products.status | order_items.product_name_snapshot |
| product_variants.name, product_variants.sku, product_variants.price | order_items.variant_name_snapshot, sku_snapshot, unit_price |
| customers.email / phone | orders.customer_email, customer_phone |
| customer_addresses | orders.shipping_address_snapshot, billing_address_snapshot |
| product_variants.price (after purchase) | order_items.unit_price + line_total |

## 24.3 Change protection

- Updating a Product / Variant / Customer / Address NEVER rewrites historical rows.
- Archiving a product / variant / category NEVER removes historical rows.
- Physical deletion of products / variants / customers with commerce history is prohibited (Section 25).
- Historical snapshots belong to the transaction that created them.

---

# 25. Delete / Retention Rules

## 25.1 Per-entity rules

| Entity / Table | Physically deletable? | Children / dependents | Policy |
|---|---|---|---|
| stores | NO (never) | all tenant tables | Deactivation via store status (DISABLED/SUSPENDED); deletion requires PO approval + archive/export |
| users | NO while memberships/audit exist | memberships RESTRICT, audit SET NULL | Deactivate via Supabase; keep the application row |
| store_memberships | YES for erroneous rows only | — | Normal removal = status INACTIVE (audited) |
| subscriptions | NO | — | Retained as Store access history |
| products | ONLY if no commerce history (no order_items, no reservations, no movements) | variants CASCADE, product_categories CASCADE, product_media CASCADE | Otherwise ARCHIVE only |
| product_variants | ONLY if no commerce history | inventory CASCADE, movements RESTRICT, reservations RESTRICT, cart_items RESTRICT, order_items SET NULL | Otherwise ARCHIVE only |
| categories | ONLY if no product_categories links | links CASCADE | Otherwise ARCHIVE only |
| product_categories | YES (unassign operation) | — | Link removal is the normal operation |
| inventory | NO (follows variant) | — | 1:1 with variant |
| inventory_reservations | NO | — | Retained (lifecycle audit trail) |
| inventory_movements | NO | — | Immutable, retained |
| customers | ONLY if no orders | addresses CASCADE, carts SET NULL, orders SET NULL | Otherwise retain (customer = commerce history) |
| customer_addresses | YES | — | Reusable; orders independent |
| carts / cart_items | YES after retention window (expired/completed) | items CASCADE | ACTIVE reservations released before cart purge |
| orders | NO (never) | items CASCADE (safety net), payments RESTRICT | Historical commerce data |
| order_items | NO | — | Immutable snapshots |
| payments / payment_attempts / payment_events | NO | attempts CASCADE, events SET NULL | Immutable payment history |
| pages / page_sections | Draft-only: YES | sections CASCADE | Published/archived retained |
| navigations / theme_configurations / store_settings | Current-state config: replaceable | — | Administrative changes audited |
| media | YES if unreferenced | product_media RESTRICT, logo SET NULL | Retain while referenced |
| product_media | YES (image removal) | — | Link removal is the normal operation |
| audit_logs | NO | — | Append-only, retained |

## 25.2 Principles

1. Historical commerce data is NEVER destroyed: orders, order items, payments, inventory movements, reservations, audit logs.
2. Soft-deletion via status is preferred where business history matters (products, variants, categories, pages).
3. Physical deletion is restricted to temporary entities (carts, draft content, media, erroneous rows).
4. Every FK delete behavior is defined in Section 9; RESTRICT is the default for entities that must survive deletion attempts.
5. "No automatic deletion of commerce data" applies to subscription expiry as well (MVP-SCOPE §31).

---

# 26. Concurrency Rules

## 26.1 Concurrency-sensitive operations

- Inventory reservation, consumption, release, availability checks.
- Checkout / order creation.
- Payment state transitions (webhook-driven).
- Reservation expiration sweep.
- Inventory adjustment.
- Idempotency-key uniqueness enforcement.

## 26.2 Mechanisms

- Single-statement atomic updates for all inventory quantity changes (Section 13.3) — no read-then-write availability decisions.
- Row-level locking (SELECT ... FOR UPDATE) when a multi-step operation must hold an inventory/variant row across steps (e.g., coordinated reservation + order creation in the same transaction).
- Unique constraints act as concurrency barriers (idempotency keys, provider_event_id, order_number, SKU).
- Conditional guarded UPDATEs (WHERE status = 'ACTIVE') make terminal state transitions safe under concurrency.
- Transactions group dependent writes (Section 28).

## 26.3 Forbidden anti-patterns (MVP)

- Read availability, then write without re-checking.
- Application-level in-memory locks.
- Distributed locks / Redis (out of MVP scope).
- UPDATE ... without a WHERE availability guard.

## 26.4 Optimistic concurrency

An optional `version` (optimistic lock) column on inventory may be added if read-modify-write admin UI flows require it (technical decision, Section 33). The transactional reservation path does not need it.

---

# 27. Idempotency Rules

## 27.1 Idempotency-sensitive operations

| Operation | Idempotency mechanism |
|---|---|
| Checkout / order creation | orders.idempotency_key UNIQUE(store_id, idempotency_key); retry returns the existing order; reservations are not duplicated |
| Payment initiation | payments.idempotency_key UNIQUE(store_id, idempotency_key); attempts unique per payment |
| Reservation release | conditional UPDATE ... WHERE status = 'ACTIVE'; decrement only when the transition actually applied |
| Reservation consumption | same guarded pattern (ACTIVE -> CONSUMED) |
| Payment success processing | guarded transitions: payment PENDING/PROCESSING -> SUCCEEDED once; reservations ACTIVE -> CONSUMED once; order PENDING -> CONFIRMED once |
| Payment failure processing | guarded transitions: payment -> FAILED once; reservations ACTIVE -> RELEASED once |
| Webhook ingestion | payment_events UNIQUE(provider, provider_event_id); reprocessing is safe (guarded transitions) |

## 27.2 Rules

- Client-supplied idempotency keys are honored for checkout and payment initiation; the backend generates keys for webhook-driven transitions.
- Idempotency keys are unique per Store (not global), matching the tenant model.
- Release/consume ordering: NEVER decrement inventory unless the reservation status transition actually affected a row.

---

# 28. Transaction Boundaries

## 28.1 Checkout (create order + reservation + payment initiation)

1. Resolve Store; validate store status + subscription access overlay.
2. Load Cart; revalidate variant availability, price, inventory, quantity, shipping, and totals (server-side).
3. Create reservation(s): atomic reserved increment + ACTIVE reservation rows (Sections 13-14).
4. Create Order + OrderItems (snapshots) + order_number.
5. Link reservations to order_id.
6. Create Payment (PENDING) + PaymentAttempt (PENDING) + provider initiation data.
7. Commit. The external provider call happens after commit (or asynchronously), never inside the transaction.

Any step failure -> full rollback (no partial order, no orphaned reservations).

## 28.2 Payment success (webhook)

Verify -> dedupe/claim event -> payment SUCCEEDED -> consume reservations (ACTIVE -> CONSUMED; on_hand and reserved decrement) -> order PENDING -> CONFIRMED -> event PROCESSED. One transaction; all transitions guarded (idempotent).

## 28.3 Payment failure (webhook)

Verify -> dedupe/claim event -> payment FAILED -> release reservations (ACTIVE -> RELEASED; reserved decrement) -> event PROCESSED.

## 28.4 Order cancellation

Guard status (only PENDING or CONFIRMED) -> order CANCELLED (cancelled_at) -> release any ACTIVE reservations -> write audit_logs (order.cancelled). One transaction.

## 28.5 Inventory adjustment

Admin adjustment -> atomic on_hand update -> inventory_movements row (INITIAL_STOCK/ADJUSTMENT). One transaction.

## 28.6 Reservation expiration sweep

Per reservation: guarded ACTIVE -> RELEASED + reserved decrement + movement row. Processed in small batches per Store; each reservation is idempotent and independently retryable.

## 28.7 General rules

- Transactions are as short as reasonably possible.
- External API calls (Paymob initiation, email) are made outside the core database transaction where possible.
- A failed transaction never leaves partial business state.
- Critical operations are safe to retry (idempotency, Section 27).

---

# 29. RLS Requirements

## 29.1 Scope

Row-Level Security is REQUIRED on every tenant-owned table as defense-in-depth. Application-layer authorization is the primary control; RLS guarantees that a leaked or forged query still cannot cross tenant boundaries.

## 29.2 Tenant context

The backend sets the tenant context per request:

- Merchant requests: after authenticating the user and resolving an ACTIVE membership, set `app.current_store_id` from the resolved Store.
- Public storefront requests: resolve the Store from the public URL (slug/domain) into a read-only context (or a dedicated public-role policy set).
- Webhook/background processing: uses the service role (RLS bypass) or explicit policy for unresolvable rows; never tenant-scoped user context.

## 29.3 Policy pattern

For every tenant table with store_id:

```sql
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_select ON products
  FOR SELECT USING (store_id = app.current_store_id());

CREATE POLICY tenant_isolation_insert ON products
  FOR INSERT WITH CHECK (store_id = app.current_store_id());

CREATE POLICY tenant_isolation_update ON products
  FOR UPDATE USING (store_id = app.current_store_id())
             WITH CHECK (store_id = app.current_store_id());

CREATE POLICY tenant_isolation_delete ON products
  FOR DELETE USING (store_id = app.current_store_id());
```

`app.current_store_id()` is a helper (SECURITY DEFINER function or session setting) that returns the tenant UUID bound to the current request/session; it must never be attacker-controlled.

## 29.4 Inherited-ownership tables (no store_id)

Policies traverse the parent (subquery on the parent table):

```sql
-- cart_items
CREATE POLICY tenant_isolation ON cart_items
  USING (EXISTS (
    SELECT 1 FROM carts c
    WHERE c.id = cart_items.cart_id
      AND c.store_id = app.current_store_id()
  ));
```

Same pattern for order_items (via orders) and payment_attempts (via payments).

## 29.5 Special tables

- users: policy allows the user to access their own row (id = auth.uid()); membership-derived reads are application-level.
- payment_events: policy requires store_id IS NOT NULL AND store_id = app.current_store_id(); unresolved rows (store_id NULL) are invisible to tenant queries and are processed only by the service role.
- stores: members may read stores they have an ACTIVE membership for (subquery on store_memberships).
- store_memberships: members may read memberships of their stores; role filtering is application-level.
- subscriptions: members may read their store's subscription.

## 29.6 Public storefront

- Public reads resolve a single Store and use a read-only policy set exposing only: published pages, ACTIVE products, purchasable variants, categories, and public store configuration.
- The public role must not be able to write and must not see data of other Stores.

## 29.7 Testing

Automated RLS tests are mandatory (MVP Definition of Done):
- Store A cannot read / write / delete Store B rows (per-table read/create/update/delete tests).
- Anonymous users cannot read merchant tables.
- Service-role paths work for webhooks and sweeps.
- Inherited-ownership tables enforce the parent's tenant boundary.

---

# 30. MVP Tables

The MVP is implemented with exactly these 28 tables:

| # | Table | Domain |
|---|---|---|
| 1 | users | Identity & Access |
| 2 | store_memberships | Identity & Access |
| 3 | stores | Tenant |
| 4 | subscriptions | Tenant |
| 5 | products | Catalog |
| 6 | product_variants | Catalog |
| 7 | categories | Catalog |
| 8 | product_categories | Catalog |
| 9 | inventory | Inventory |
| 10 | inventory_reservations | Inventory |
| 11 | inventory_movements | Inventory |
| 12 | customers | Customers |
| 13 | customer_addresses | Customers |
| 14 | carts | Commerce |
| 15 | cart_items | Commerce |
| 16 | orders | Commerce |
| 17 | order_items | Commerce |
| 18 | payments | Commerce |
| 19 | payment_attempts | Commerce |
| 20 | payment_events | Commerce |
| 21 | pages | CMS |
| 22 | page_sections | CMS |
| 23 | navigations | CMS |
| 24 | theme_configurations | CMS |
| 25 | media | Media |
| 26 | product_media | Media |
| 27 | store_settings | Store configuration (supporting/technical) |
| 28 | audit_logs | Audit |

NOT persisted: **Checkout** (orchestration boundary only; no table, entity, or persistence model).

---

# 31. Future Tables

Explicitly deferred; MUST NOT be created in the MVP:

- `invoices` (SaaS billing/invoicing)
- `external_integrations` (Meta/Facebook/Instagram/WhatsApp/other platform integrations)

Additional future extensions (require their feature to be approved before any table is added):
- discounts/coupons (discount engine is OUT of MVP)
- refunds (no refund tables or states in MVP)
- customer authentication accounts
- multi-location inventory (warehouses, locations, transfers, purchase orders, suppliers)
- shipping carriers / tracking
- product reviews, wishlists, loyalty, B2B, marketplace
- analytics / warehouse

Future-compatibility rules:
- Cart rows are retained so cart recovery / abandoned-cart features can be added without schema redesign.
- The payment schema is provider-agnostic so new providers plug in without redesigning orders.
- Order snapshots make future discount/refund/fulfillment features safe to add.

---

# 32. Database Invariants

The following are FINAL and MUST be enforceable in the database + application:

1. Every Product has at least one ProductVariant.
2. Product <-> Category is N:M through product_categories (never 1:N).
3. product_categories links only same-Store products and categories (composite FK enforced).
4. available = on_hand - reserved (derived; CHECK on_hand >= reserved).
5. Overselling never occurs (atomic guarded updates).
6. Inventory operations are concurrency-safe.
7. Cart pricing is not authoritative; checkout revalidates.
8. Order status and Payment status are separate state machines.
9. Order statuses are exactly PENDING, CONFIRMED, PROCESSING, SHIPPED, DELIVERED, CANCELLED.
10. Payment statuses are exactly PENDING, PROCESSING, SUCCEEDED, FAILED.
11. No MVP refund states (no refunded / partially_refunded anywhere).
12. Reservation lifecycle is exactly ACTIVE -> CONSUMED or ACTIVE -> RELEASED.
13. Expiration results in RELEASED (a path, not a state).
14. Reservation release/consume is idempotent.
15. Store statuses are exactly ACTIVE, DISABLED, SUSPENDED.
16. Subscription statuses are exactly TRIAL, ACTIVE, EXPIRED.
17. Subscription expiry is never stored as a Store status.
18. Roles are exactly OWNER, ADMIN, STAFF.
19. Store is the primary tenant/business boundary.
20. Historical order data is protected from mutable product/customer changes.
21. Cancellation only from PENDING or CONFIRMED; CANCELLED is terminal; auditable.
22. Checkout is not a persistent entity.
23. Guest checkout is supported; a Customer is not required for orders.
24. Carts are Store-scoped; guest identity is an opaque token.
25. Order numbers are human-readable and unique per Store; the internal id is immutable.
26. Payment provider abstraction: the Order domain is not coupled to any provider.
27. No table stores floating-point money; all money is integer minor units.

---

# 33. Open Technical Decisions

Decisions required by the database design that are not fully specified by the source documents, classified per the NO INVENTION RULE.

| # | Decision | Classification | Chosen direction (if any) |
|---|---|---|---|
| 1 | Postgres native ENUM vs TEXT + CHECK for enums | Technical implementation decision | Either; values as documented in Section 12 |
| 2 | DB-trigger enforcement of "product has >= 1 variant" and state-transition guards | Technical implementation decision | Optional defense-in-depth; application enforces in MVP |
| 3 | Optimistic-lock (version) column on inventory | Technical implementation decision | Optional, for admin UI flows only |
| 4 | Cart purge retention window | Technical implementation decision | Configurable (e.g., 30-90 days); ACTIVE reservations released before purge |
| 5 | Reservation expiration sweep mechanism (periodic job vs lazy) | Technical implementation decision | In-monolith scheduled job + lazy release; no external infrastructure |
| 6 | Order payment_status read path (join to active payment) | Required database decision | No column on orders; read the active payment |
| 7 | Store slug global uniqueness | Required database decision | stores.slug UNIQUE (public storefront URL) |
| 8 | Store URL/subdomain strategy mechanics | Technical implementation decision | Delegated to storefront/API design |
| 9 | guest_token entropy/length | Technical implementation decision | High-entropy opaque random token |
| 10 | Inventory movement snapshot columns (on_hand_after/reserved_after) | Technical implementation decision | Included for self-contained audit rows |
| 11 | JSONB schema for page_sections content, navigations.items, theme config, store_settings | Technical implementation decision | Accepted for presentation/operational config only |
| 12 | Idempotency key format + replay window | Technical implementation decision | Application-generated/validated; per-Store uniqueness |
| 13 | Order-number generation (sequence) | Technical implementation decision | Application-generated; UNIQUE(store_id, order_number) |
| 14 | Trial duration default | Requires Product Owner approval | Configurable business parameter; exact value is a product decision |
| 15 | Notification persistence (order confirmation emails) | Future scope | Notifications react to events; no notification table in MVP |
| 16 | Customer authentication | Future scope | customers.auth_user_id reserved only |

No open decision alters an approved business rule. The single business-parameter decision (#14) is flagged for the Product Owner.

---

# 34. Database Readiness Checklist

Verified against DOMAIN-MODEL.md (v2.0 FINAL):

- [x] Every MVP Domain Model entity has a clear persistence decision (Section 6).
- [x] No non-persistent domain concept became a table (Checkout = no table).
- [x] Every table has a clear owner (Sections 5, 6).
- [x] Tenant isolation is defined (Sections 5, 29).
- [x] Every relationship is represented correctly (Sections 6, 7, 9).
- [x] Product/ProductVariant cardinality is correct (1:N; every product >= 1 variant).
- [x] ProductCategory N:M is correct.
- [x] Inventory invariants are enforceable (Sections 13, 32).
- [x] Reservation lifecycle matches Domain Model (ACTIVE -> CONSUMED/RELEASED; expiration = release path).
- [x] Order lifecycle matches Domain Model.
- [x] Payment lifecycle matches Domain Model.
- [x] Order and Payment states are separate (no payment_status on orders).
- [x] No MVP refund states exist.
- [x] Historical OrderItem data is protected (snapshots, immutability).
- [x] Payment provider abstraction preserved (payments/provider; events log).
- [x] Cart supports guest and authenticated customers.
- [x] Subscription states match Domain Model (TRIAL/ACTIVE/EXPIRED).
- [x] Store status matches Domain Model (ACTIVE/DISABLED/SUSPENDED).
- [x] Membership roles match Domain Model (OWNER/ADMIN/STAFF).
- [x] CMS entities are correctly represented (pages, sections, navigation, theme).
- [x] Foreign key behavior is defined (Section 9).
- [x] Delete/retention behavior is defined (Section 25).
- [x] Required indexes are defined (Section 11).
- [x] Unique constraints are defined (Section 10).
- [x] Concurrency-sensitive operations identified (Section 26).
- [x] Idempotency-sensitive operations identified (Section 27).
- [x] RLS requirements documented (Section 29).
- [x] No undocumented business rules were invented (Section 33 classification).
- [x] No contradictions remain (see task Finalization Report).

---

# 35. Change Control

- This document is a controlled architectural artifact.
- No AI agent may create, remove, rename, or significantly modify database tables or relationships without updating this document AND receiving explicit approval.
- Any approved change to DOMAIN-MODEL.md first: re-run the contradiction check, then update this document, then update API-SPEC / USER-STORIES as needed, then implement.
- Schema changes in the database are performed exclusively through versioned, reviewable, reproducible migrations.

---

**END OF DATABASE SPECIFICATION (v2.0 FINAL)**
