# Ziad E-commerce — Domain Model

**Version:** 2.0
**Status:** FINAL
**Owner:** Ziad
**Technical Lead:** CTO / AI-assisted development

---

# 1. Document Purpose

This document defines the final business domain model of the Ziad E-commerce SaaS platform.

It is the authoritative definition of:

- Core business entities
- Entity responsibilities
- Relationships
- Ownership boundaries
- Lifecycle / state machines
- Domain invariants
- MVP boundaries

**This document is the final domain source of truth for the MVP. Implementation agents MUST NOT introduce, remove, or alter core MVP entities, relationships, ownership boundaries, lifecycle states, or domain invariants without explicit Product Owner approval.**

This document is the source of truth for the downstream artifacts:

- Database Specification (docs/DATABASE.md)
- API Specification (docs/API-SPEC.md)
- Backend modules
- Authorization model (docs/AUTHORIZATION.md)
- Business rules
- Automated tests

---

# 2. Source of Truth Hierarchy

When two documents conflict, the following hierarchy applies:

1. Explicit Product Owner decisions (Section 28 of this document)
2. BRD (docs/BRD.md)
3. PRD (docs/PRD.md)
4. MVP-SCOPE (docs/MVP-SCOPE.md)
5. This document (DOMAIN-MODEL)
6. DATABASE (docs/DATABASE.md)
7. API-SPEC (docs/API-SPEC.md)
8. USER-STORIES (docs/USER-STORIES.md)
9. DEVELOPMENT-ROADMAP (docs/DEVELOPMENT-ROADMAP.md)
10. AI-AGENT-RULES (docs/AI-AGENT-RULES.md)

Rules:

- Approved Product Owner decisions are authoritative and supersede any conflicting wording in the source documents.
- Contradictions must be identified and reported.
- Implementation agents must never silently choose an interpretation when documents conflict.
- No core MVP domain decision may remain unresolved; if one is discovered, work must stop and the Product Owner must be consulted.

# 3. Domain Architecture

The platform is organized into the following business domains:

```text
Identity & Access
        |
        v
Tenant / Store
        |
        +-------------------+
        |                   |
        v                   v
     Catalog            Customers
        |                   |
        v                   |
    Inventory              |
        |                   |
        +--------+----------+
                 |
                 v
               Cart
                 |
                 v
              Checkout
                 |
                 v
               Order
                 |
                 v
              Payment

Storefront / CMS
        |
        +---- reads Catalog
        +---- reads Store
        +---- reads Inventory

Subscription
        |
        +---- controls Store access (access overlay)

Media
        |
        +---- serves Catalog / Store / CMS

Notifications
        |
        +---- reacts to business events
```

---

# 4. Core Entities

The MVP core entities are:

## Identity & Access

- User
- StoreMembership

## Tenant

- Store
- Subscription

## Catalog

- Product
- ProductVariant
- Category
- ProductCategory

## Inventory

- Inventory
- InventoryReservation
- InventoryMovement

## Customers

- Customer
- CustomerAddress

## Commerce

- Cart
- CartItem
- Order
- OrderItem
- Payment
- PaymentAttempt
- PaymentEvent

## Supporting MVP domains (storefront presentation / governance)

- Page
- PageSection
- Navigation
- ThemeConfiguration
- Media
- AuditLog

Checkout is an application/domain orchestration boundary, NOT a persistent entity. It is intentionally absent from the entity list. See Section 11.

Each core entity in this document is specified with:

- Purpose
- Ownership
- Parent/aggregate relationship
- Important relationships
- Lifecycle (where applicable)
- Key invariants
- MVP status

# 5. Identity & Membership Domain

## 5.1 User

**Purpose:** A platform-level authenticated user (merchant).

**Ownership:** Platform-level identity. A User does NOT own Store commerce data.

**Parent/aggregate:** None (platform root identity).

**Important relationships:**
- User 1:N StoreMembership
- User N:M Store (through StoreMembership)

**Lifecycle:** User lifecycle is owned by the authentication provider (Supabase Auth). No core MVP business lifecycle beyond account existence.

**Key invariants:**
- A User accesses Store data ONLY through StoreMembership.
- User identity, Store membership, and Store ownership are distinct concepts.

**MVP status:** Core.

## 5.2 StoreMembership

**Purpose:** Represents the relationship between a User and a Store, including role assignment.

**Ownership:** Store-scoped. A membership grants access to exactly one Store.

**Parent/aggregate:** Belongs to a Store.

**Important relationships:**
- StoreMembership N:1 User
- StoreMembership N:1 Store
- A User may belong to multiple Stores in the future.

**Lifecycle:** Membership status is an authorization concern; the MVP does not define a rich membership lifecycle.

**Key invariants:**
- Each membership references exactly one User and one Store.
- Fixed role-based authorization is used in the MVP: OWNER, ADMIN, STAFF.
- No custom per-membership permission overrides in the MVP.
- The detailed permission matrix is defined in docs/AUTHORIZATION.md, NOT duplicated here.

**MVP status:** Core.

## 5.3 MVP Roles

The MVP roles are fixed:

- OWNER
- ADMIN
- STAFF

The merchant who creates the Store is assigned the OWNER role.

The exact permission matrix is part of the authorization specification (docs/AUTHORIZATION.md).

---

# 6. Store (Tenant) Domain

## 6.1 Store

**Purpose:** A merchant's e-commerce business. The Store is the primary merchant/business ownership boundary of the multi-tenant platform.

**Ownership:** The Store is the root tenant entity. All core merchant data is Store-scoped.

**Parent/aggregate:** Root tenant aggregate.

**Important relationships:**
- Store 1:N StoreMembership
- Store 1:N Product
- Store 1:N Category
- Store 1:N Customer
- Store 1:N Cart
- Store 1:N Order
- Store 1:N Page
- Store 1:N Media
- Store 1:1 Subscription
- Store -> storefront availability (access overlay, see 6.3)

**Lifecycle:** Store status is a state machine (see 6.2).

**Key invariants:**
- No tenant may access another tenant's commerce data.
- Core merchant data must be Store-scoped.
- User identity, Store membership, and Store ownership are distinct concepts.

**MVP status:** Core.

## 6.2 Store Status

Store status is a FINALIZED state machine.

States (exactly):

- ACTIVE
- DISABLED
- SUSPENDED

Semantics:

**ACTIVE:**
- Storefront available
- Commerce operations available

**DISABLED:**
- Merchant-controlled closure
- Storefront not purchasable
- Merchant retains management access

**SUSPENDED:**
- Platform-controlled state
- Merchant cannot set it
- Storefront not purchasable

Rules:

- Subscription expiration is NOT a Store status.
- Store status and Subscription status are separate concepts.
- Subscription expiration is an access overlay, not a Store status change.

**MVP status:** Finalized.

## 6.3 Storefront Availability

Storefront availability is governed by:

- Store status: the storefront is purchasable only when the Store is ACTIVE. DISABLED and SUSPENDED stores are not purchasable.
- Subscription access overlay: when the Store's Subscription is EXPIRED, the storefront is disabled (regardless of Store status) and the merchant dashboard becomes read-only. Commerce data remains preserved.

# 7. Catalog Domain

## 7.1 Product

**Purpose:** A merchant's sellable product concept.

**Ownership:** Belongs to exactly one Store.

**Parent/aggregate:** Store -> Product. Product is the aggregate root for its variants and catalog relationships.

**Important relationships:**
- Product 1:N ProductVariant
- Product N:M Category (through ProductCategory)
- Product 1:N ProductMedia (media association)

**Lifecycle:**

```text
DRAFT -> ACTIVE -> ARCHIVED
```

Semantics:
- DRAFT: not publicly purchasable.
- ACTIVE: may appear on the storefront and be purchased.
- ARCHIVED: not newly purchasable; historical orders remain unchanged.

**Key invariants:**
- Every Product MUST have at least one ProductVariant.
- A Product with zero variants is INVALID.
- A simple product uses one Default ProductVariant.
- There is NO "product without variant" commerce path.

**MVP status:** Core.

## 7.2 ProductVariant

**Purpose:** The actual purchasable unit of a Product.

**Ownership:** Belongs to a Product, which belongs to a Store (Store-scoped through the Product).

**Parent/aggregate:** Product 1:N ProductVariant.

**Important relationships:**
- ProductVariant 1:1 Inventory
- ProductVariant 1:N InventoryReservation
- ProductVariant is referenced by CartItem
- ProductVariant information is snapshotted by OrderItem
- Checkout operates on ProductVariants

**Lifecycle:**

```text
ACTIVE -> ARCHIVED
```

- ACTIVE: purchasable.
- ARCHIVED: cannot be added to new carts; historical orders unchanged.

**Key invariants:**
- Inventory belongs to ProductVariant (not Product).
- SKU (when present) is unique within a Store.
- Prices use a fixed money representation (no floating point).
- Every Product must have at least one ProductVariant.

**MVP status:** Core.

## 7.3 Category

**Purpose:** A catalog classification for organizing products.

**Ownership:** Belongs to exactly one Store.

**Parent/aggregate:** Store -> Category.

**Important relationships:**
- Category N:M Product (through ProductCategory)

**Lifecycle:**

```text
ACTIVE -> ARCHIVED
```

- ACTIVE: may be presented on the storefront.
- ARCHIVED: not presented as an active storefront category; existing Product associations are preserved (historical data unchanged).

**Key invariants:**
- A Category belongs to exactly one Store.
- A Category and a Product may only be linked in ProductCategory when both belong to the same Store.
- Parent/child category hierarchy is NOT part of the MVP domain model (deferred; see Section 26).

**MVP status:** Core.

## 7.4 ProductCategory

**Purpose:** The associative relationship between Products and Categories.

**Ownership:** Store-scoped through both sides of the relationship.

**Important relationships:**
- Product N:M Category through ProductCategory.

**Key invariants:**
- The relationship is MANY-TO-MANY and must NOT be changed to 1:N.
- A given (Product, Category) pair must not be duplicated within a Store.
- Both entities in a link must belong to the same Store.

**MVP status:** Core.

# 8. Inventory Domain

## 8.1 Inventory

**Purpose:** The current stock state of a ProductVariant.

**Ownership:** Store-scoped through its ProductVariant.

**Parent/aggregate:** ProductVariant 1:1 Inventory.

**Important relationships:**
- Inventory 1:1 ProductVariant
- Inventory 1:N InventoryMovement
- Inventory 1:N InventoryReservation

**Lifecycle:** Continuous state (quantities change over time); no separate lifecycle status in the MVP.

**Key invariants:**

```text
Available = On Hand - Reserved
```

- Available must never become negative (overselling must be prevented).
- Inventory operations must be concurrency-safe.
- Reserved quantity increases when reservations become ACTIVE and decreases when reservations are consumed or released.

**MVP status:** Core.

## 8.2 InventoryReservation

**Purpose:** Represents temporarily reserved inventory during the checkout/order process.

**Ownership:** Store-scoped through its ProductVariant.

**Parent/aggregate:** ProductVariant 1:N InventoryReservation.

**Important relationships:**
- InventoryReservation N:1 ProductVariant
- InventoryReservation relates to the order/checkout context that created it.

**Lifecycle (FINALIZED):**

```text
ACTIVE -> CONSUMED
OR
ACTIVE -> RELEASED
```

Reservation timing: reservation occurs during checkout, before payment initiation.

Outcomes:
- Successful verified payment: ACTIVE -> CONSUMED.
- Payment failure: ACTIVE -> RELEASED.
- Order cancellation: ACTIVE -> RELEASED.
- Expiration: ACTIVE -> RELEASED (expiration is a REASON/PATH leading to RELEASED, not a separate state).

Rules:
- EXPIRED is NOT a separate lifecycle state.
- CONVERTED is NOT a domain lifecycle state.
- There is NO two-phase reservation lifecycle.
- Release must be idempotent.
- Reservations must be concurrency-safe.

**Key invariants:**
- A reservation cannot exceed available inventory.
- Available = On Hand - Reserved remains non-negative.

**MVP status:** Core (FINALIZED).

## 8.3 InventoryMovement

**Purpose:** An immutable audit record of an inventory change.

**Ownership:** Store-scoped through its ProductVariant.

**Parent/aggregate:** ProductVariant 1:N InventoryMovement.

**Important relationships:**
- InventoryMovement N:1 ProductVariant
- InventoryMovement references the Inventory state it changed.

**Lifecycle:** Immutable (append-only).

**Key invariants:**
- Every manual inventory adjustment produces an InventoryMovement.
- Inventory history must not be silently overwritten.

**MVP status:** Core.

# 9. Customer Domain

## 9.1 Customer

**Purpose:** A customer who purchases from a merchant's Store.

**Ownership:** Store-scoped. The same person in a different Store is a different Customer.

**Parent/aggregate:** Store -> Customer.

**Important relationships:**
- Customer 1:N CustomerAddress
- Customer 1:N Order
- Customer (optional) 1:N Cart (a Customer may have an associated Cart)
- Customer is NOT required for Order creation (guest checkout)

**Lifecycle:** No rich MVP lifecycle. A Customer record may be created during checkout for merchant-side order management, even for guests.

**Key invariants:**
- Customer accounts are OPTIONAL.
- Guest checkout is supported: a Customer account is NOT required to place an Order.
- Customer identity and authentication identity are conceptually separate.

**MVP status:** Core.

## 9.2 CustomerAddress

**Purpose:** A customer's saved address.

**Ownership:** Store-scoped through the Customer.

**Parent/aggregate:** Customer 1:N CustomerAddress.

**Important relationships:**
- CustomerAddress N:1 Customer
- Historical Order shipping information must NOT depend on the current CustomerAddress record (Order snapshots its own shipping data).

**Lifecycle:** Managed address records; no MVP lifecycle state machine.

**MVP status:** Core (supporting checkout and customer management).

---

# 10. Cart Domain

## 10.1 Cart

**Purpose:** The customer's persistent shopping session.

**Ownership:** A Cart always belongs to a Store.

**Parent/aggregate:** Store -> Cart.

**Important relationships:**
- Cart 1:N CartItem
- Cart (optional) N:1 Customer (authenticated customer cart)
- Cart (optional) N:1 Guest/session token (guest cart)
- Cart -> Checkout process (the Cart is the input to checkout)

Associations:
- Authenticated Customer cart: Cart -> Customer.
- Guest cart: Cart -> Guest/session token.

Guest cart token:
- Opaque random token.
- Must not contain business information.
- Cart creation does NOT require authentication.

**Lifecycle:**
- A Cart is ACTIVE while usable.
- Cart expiration is supported: an expired Cart is no longer usable.
- After checkout completes and an Order is created, the Cart's shopping purpose is fulfilled and it must not be reused for a new checkout; the precise representation is a database/implementation concern.
- No guest/customer cart merge in the MVP.
- No abandoned-cart recovery in the MVP.
- No advanced cart recovery infrastructure in the MVP.
- The design must remain future-compatible with cart recovery, abandoned-cart handling, and customer cart persistence.

**Key invariants:**
- Cart pricing is NOT authoritative.
- Checkout must revalidate: product availability, variant availability, price, inventory, quantity, store status, and totals.

**MVP status:** Core.

## 10.2 CartItem

**Purpose:** A ProductVariant and quantity selected in a Cart.

**Ownership:** Store-scoped through its Cart.

**Parent/aggregate:** Cart 1:N CartItem.

**Important relationships:**
- CartItem N:1 Cart
- CartItem N:1 ProductVariant

**Key invariants:**
- CartItem references a ProductVariant (not a bare Product).
- Quantity must be a positive value.
- CartItem pricing is NOT authoritative.

**MVP status:** Core.

# 11. Checkout (Orchestration Boundary — NOT an Entity)

Checkout is an application/domain orchestration boundary, NOT a persistent entity.

Do NOT create a checkout table, checkout entity, or checkout persistence model unless explicitly approved by the Product Owner.

Checkout is the process that connects:

```text
Cart
-> Checkout validation
-> Inventory reservation
-> Order creation
-> Payment initiation
```

Clear distinction:

- Cart = persistent shopping state
- Checkout = orchestration / process
- Order = persistent commercial transaction

Checkout must revalidate (server-side, authoritative):

- Store availability
- Product availability (published/active)
- Variant availability (active)
- Price (current)
- Quantity
- Inventory (sufficient, reserved)
- Customer and shipping information
- Order totals

Client-provided totals are never authoritative.

Valid flows:

```text
Guest    -> Cart -> Checkout -> Order
Customer -> Cart -> Checkout -> Order
```

**MVP status:** Core (as an orchestration boundary).

---

# 12. Order Domain

## 12.1 Order

**Purpose:** A persistent commercial transaction resulting from a completed checkout.

**Ownership:** Belongs to exactly one Store.

**Parent/aggregate:** Store -> Order. Order is the aggregate root for its items and payments.

**Important relationships:**
- Order 1:N OrderItem
- Order 1:N Payment
- Order (optional) N:1 Customer
- Order -> Checkout process (created by checkout orchestration)

Identity:
- Internal immutable identifier (not exposed as the primary customer-facing reference).
- Human-readable Order number, unique per Store. Example: ORD-2026-000001.

**Lifecycle:** See 12.3 Order Status State Machine.

**Key invariants:**
- Order creation is idempotent (retries must not create duplicate orders).
- A Customer record is not required to create an Order (guest checkout).
- Historical order data is immutable (see Section 21).

**MVP status:** Core.

## 12.2 OrderItem

**Purpose:** Represents a purchased ProductVariant, preserved with purchase-time snapshots.

**Ownership:** Store-scoped through its Order.

**Parent/aggregate:** Order 1:N OrderItem.

**Important relationships:**
- OrderItem N:1 Order
- OrderItem snapshots ProductVariant information

Snapshots (at minimum):
- Product name
- Variant name
- SKU
- Unit price
- Quantity
- Line total

**Key invariants:**
- OrderItem must NOT depend on current mutable Product/ProductVariant data for historical accuracy.
- Changing a Product/Variant later must NOT rewrite historical OrderItems.

**MVP status:** Core.

## 12.3 Order Status State Machine

Order status is a separate state machine from Payment status.

MVP states (exactly):

- PENDING
- CONFIRMED
- PROCESSING
- SHIPPED
- DELIVERED
- CANCELLED

Normal lifecycle:

```text
PENDING -> CONFIRMED -> PROCESSING -> SHIPPED -> DELIVERED
```

Rules:
- No arbitrary status transitions.
- No normal forward-state skipping.
- CANCELLED is terminal.
- Cancellation is allowed only from PENDING or CONFIRMED in the MVP.
- Cancellation must be auditable.
- Refund automation is OUT of MVP.
- refunded and partially_refunded are NOT MVP Order states.

Order status != Payment status.

Payment success may cause the approved Order transition to CONFIRMED.

**MVP status:** Finalized.

# 13. Payment Domain

## 13.1 Payment

**Purpose:** Represents the payment state associated with an Order.

**Ownership:** Store-scoped through its Order.

**Parent/aggregate:** Order 1:N Payment.

**Important relationships:**
- Payment N:1 Order
- Payment 1:N PaymentAttempt
- Payment 1:N PaymentEvent

**Key invariants:**
- Payment state must remain provider-agnostic.
- External providers are never the source of truth for Order or Payment state.
- Payment success does NOT mean the Order is DELIVERED.

**MVP status:** Core.

## 13.2 PaymentAttempt

**Purpose:** An individual attempt to pay an Order.

**Ownership:** Store-scoped through its Order.

**Parent/aggregate:** Payment 1:N PaymentAttempt (an Order may have multiple attempts).

**Key invariants:**
- A failed payment attempt must NOT create a second Order automatically.
- Payment initiation must be idempotent.

**MVP status:** Core.

## 13.3 PaymentEvent

**Purpose:** An external payment-provider event (webhook) received by the platform.

**Ownership:** Store-scoped (through the Order/Payment when resolvable).

**Important relationships:**
- PaymentEvent N:1 Payment (when the payment can be resolved)
- Provider event ID is unique per provider.

**Key invariants:**
- Webhook authenticity must be verified.
- Events must be deduplicated.
- Payment webhook processing must be idempotent and safe to retry.
- A browser redirect alone must NOT be treated as authoritative payment confirmation.

**MVP status:** Core.

## 13.4 Payment Status State Machine

Payment status is a separate state machine from Order status.

MVP states (exactly):

- PENDING
- PROCESSING
- SUCCEEDED
- FAILED

Normal flow:

```text
PENDING -> PROCESSING -> SUCCEEDED
```

Failure flow:

```text
PENDING -> PROCESSING -> FAILED
```

Rules:
- No additional MVP payment states.
- authorized, paid, refunded, and partially_refunded are NOT MVP payment states.
- Order status != Payment status.
- Payment success may cause the approved Order transition to CONFIRMED (it does NOT imply fulfillment).
- The verified provider webhook is authoritative for payment confirmation.

**MVP status:** Finalized.

## 13.5 Payment Provider Abstraction

The Payments domain must remain provider-agnostic.

Architecture:

```text
Payment Domain
-> Payment Provider Interface
-> Provider Adapter
-> Paymob
```

Future providers may include:
- Paymob
- Fawry
- Cash on Delivery
- Stripe

Rules:
- Order domain logic must not be coupled directly to Paymob.
- Adding a provider must not redesign the Order domain.

**MVP status:** Finalized.

# 14. CMS Domain

## 14.1 Page

**Purpose:** A public Store page (e.g., Home, About, Contact, FAQ).

**Ownership:** Belongs to a Store.

**Parent/aggregate:** Store -> Page.

**Important relationships:** Page 1:N PageSection.

**MVP status:** Supporting (P1).

## 14.2 PageSection

**Purpose:** A configurable section within a Page.

Examples: Hero, Banner, Featured Products, Category Grid, Text, Image.

**Ownership:** Store-scoped through its Page.

**Parent/aggregate:** Page 1:N PageSection.

**Important relationships:** PageSection N:1 Page; sections have an order.

**MVP status:** Supporting (P1).

## 14.3 Navigation

**Purpose:** Storefront navigation configuration.

**Ownership:** Belongs to a Store.

**Important relationships:** May reference Pages, Categories, and Storefront destinations.

**MVP status:** Supporting (P1).

## 14.4 ThemeConfiguration

**Purpose:** Store visual configuration (logo reference, primary color, typography, basic layout settings).

**Ownership:** Belongs to a Store.

**MVP status:** Supporting (P1). No visual page-builder domain in the MVP.

---

# 15. Media Domain

## 15.1 Media

**Purpose:** A stored media asset (product image, store logo, CMS image).

**Ownership:** Store-scoped.

**Storage:** Supabase Storage. The database stores metadata and references, not binary data.

**MVP status:** Supporting (P1).

---

# 16. Subscription Domain

## 16.1 Subscription

**Purpose:** The commercial subscription/access state of a Store.

**Ownership:** Belongs to a Store (Store 1:1 Subscription).

**Parent/aggregate:** Store -> Subscription.

**Important relationships:** Subscription N:1 Store.

**Lifecycle (FINALIZED), MVP states (exactly):**

- TRIAL
- ACTIVE
- EXPIRED

Transitions (exactly):

```text
TRIAL -> ACTIVE
TRIAL -> EXPIRED
ACTIVE -> EXPIRED
EXPIRED -> ACTIVE
```

Rules:
- No MVP states: PAST_DUE, CANCELLED, SUSPENDED.
- When a subscription expires:
  - Dashboard becomes read-only.
  - Storefront becomes disabled.
  - Commerce data remains preserved.
  - No automatic data deletion.
- Reactivation is supported: EXPIRED -> ACTIVE.
- Exact trial duration is a configurable business parameter (not hard-coded).
- Subscription expiration is an access overlay, NOT a Store status.
- Subscription status and Store status are separate concepts.
- Subscription controls platform access but does not own commerce data.

**MVP status:** Core (trial + expiry enforcement). Advanced subscription billing is deferred (see Section 26).

---

# 17. Audit Domain

## 17.1 AuditLog

**Purpose:** Records auditable administrative actions.

**Ownership:** Store-scoped.

**Parent/aggregate:** Store -> AuditLog.

**Important relationships:**
- AuditLog N:1 Store
- AuditLog N:1 User (actor, where applicable)

Examples:
- Product created / updated
- Inventory adjusted
- Order status changed (including cancellation)
- Store configuration changed
- Permission changed

AuditLog identifies: Actor, Store, Action, Target entity, Target identifier, Timestamp, and relevant metadata.

**MVP status:** Supporting (P1).

# 18. Ownership / Multi-Tenancy

The platform is multi-tenant. The Store is the primary merchant/business ownership boundary.

Ownership model:

```text
Store (tenant boundary)
  +-- Products (through ProductVariants)
  +-- Categories (+ ProductCategory)
  +-- Inventory (through ProductVariants)
  +-- Customers (+ CustomerAddresses)
  +-- Carts (+ CartItems)
  +-- Orders (+ OrderItems, Payments)
  +-- CMS (Pages, Sections, Navigation, ThemeConfiguration)
  +-- Media
  +-- Subscription
  +-- AuditLogs
  +-- StoreMemberships (Store-scoped access records)
```

Platform-level (not Store-owned):

- User (identity)

Distinct concepts:

- User identity: who you are on the platform.
- Store membership: which Stores you may access and with which role.
- Store ownership: which Store is the merchant's business boundary.

Rules:

- No tenant may access another tenant's commerce data.
- Core merchant data must be Store-scoped.
- Application authorization and PostgreSQL RLS are implementation mechanisms that must enforce these boundaries.

Source of truth:

- The following domains are authoritative in PostgreSQL: Store, Catalog, Inventory, Customer, Cart, Order, Payment, CMS, Subscription.
- External providers (e.g., Paymob, Meta, Supabase Storage) are never the source of truth for these domains.

---

# 19. Domain Boundaries and Dependency Rules

The initial backend modules map approximately to:

```text
identity
stores
catalog
inventory
customers
cart
orders
payments
cms
media
subscriptions
notifications
audit
```

The modules are part of one modular monolith. They are NOT independent microservices.

Checkout is an application/domain orchestration boundary. It is not a separate persistence module and has no database table. It coordinates Cart, Orders, Inventory, and Payments application services within the modular monolith.

Allowed conceptual dependencies:

```text
Identity -> Store
Store -> Catalog, Inventory, Customers, CMS, Subscriptions
Catalog -> Inventory
Catalog -> Cart
Catalog -> Orders
Customers -> Orders
Orders -> Payments
```

Principle: a domain must not directly modify another domain's internal data structures. Communication happens through explicit application services, domain interfaces, and domain events where appropriate.

---

# 20. Core Relationships

The following relationships are FINAL:

```text
Store -> StoreMembership -> User
Store 1:N Product
Product 1:N ProductVariant
Product N:M Category (through ProductCategory)
ProductVariant 1:1 Inventory
ProductVariant 1:N InventoryReservation
Store 1:N Customer
Store 1:N Cart
Customer (optional) 1:N Cart
Cart 1:N CartItem
CartItem N:1 ProductVariant
Cart -> Checkout process
Checkout -> InventoryReservation
Checkout -> Order
Order 1:N OrderItem
Order 1:N Payment
Payment 1:N PaymentAttempt
Payment 1:N PaymentEvent
Store 1:1 Subscription
Store -> storefront availability (Store status + Subscription access overlay)
```

Checkout is intentionally absent from persisted relationships: it is an application orchestration boundary, not a persisted entity.

---

# 21. Historical / Snapshot Data

Commerce history must remain stable.

Changing the following MUST NOT silently modify historical records:

- Product name
- Product price
- Variant name
- SKU
- Customer address

Protected historical records:

- Historical Order
- Historical OrderItem
- Historical payment records

Rules:

- OrderItem preserves purchase-time snapshots (product name, variant name, SKU, unit price, quantity, line total).
- Order snapshots shipping information independently of current CustomerAddress records.
- Payment history must remain auditable.
- Historical snapshots belong to the transaction that created them.

# 22. Domain Invariants

The following invariants are FINAL and must be enforced by any implementation:

1. Every Product has at least one ProductVariant (simple products use a Default ProductVariant).
2. Product <-> Category is MANY-TO-MANY through ProductCategory.
3. ProductCategory links only Products and Categories within the same Store.
4. Inventory: Available = On Hand - Reserved.
5. Overselling must not occur (Available never becomes negative).
6. Inventory operations are concurrency-safe.
7. Cart pricing is NOT authoritative; checkout revalidates availability, variant, price, inventory, quantity, store status, and totals.
8. Order status and Payment status are separate state machines.
9. Order statuses are exactly: PENDING, CONFIRMED, PROCESSING, SHIPPED, DELIVERED, CANCELLED.
10. Payment statuses are exactly: PENDING, PROCESSING, SUCCEEDED, FAILED.
11. Refund states are not part of the MVP (no refunded / partially_refunded).
12. Reservation lifecycle is exactly: ACTIVE -> CONSUMED or ACTIVE -> RELEASED.
13. Reservation expiration results in RELEASED (a reason/path, not a separate state).
14. Reservation release is idempotent.
15. Store statuses are exactly: ACTIVE, DISABLED, SUSPENDED.
16. Subscription statuses are exactly: TRIAL, ACTIVE, EXPIRED.
17. Subscription expiry is not stored as a Store status.
18. MVP roles are exactly: OWNER, ADMIN, STAFF (fixed role-based authorization).
19. Store is the primary merchant ownership boundary.
20. Historical order information is protected from mutable product changes.
21. Order cancellation is allowed only from PENDING or CONFIRMED, and is auditable.
22. CANCELLED is a terminal Order state.
23. Checkout is not a persistent entity/table.
24. Guest checkout is supported; a Customer is not required to create an Order.
25. Cart is always Store-scoped; guest cart identity is an opaque token without business information.
26. Order numbers are human-readable and unique per Store; the internal identifier is immutable.
27. Payment provider abstraction: the Order domain must not be coupled to a specific provider.

---

# 23. Concurrency-Sensitive Domains

The following areas are concurrency-sensitive and MUST be handled safely (implementation details belong to the DATABASE/architecture/application design):

- Inventory reservation
- Inventory consumption
- Inventory release
- Stock availability checks

The concurrency-sensitive domain invariant is:

```text
Available = On Hand - Reserved
```

Overselling must not occur.

Additional transaction-sensitive areas:

- Checkout
- Order creation
- Payment state transitions

---

# 24. Idempotency-Sensitive Operations

The following operations are idempotency-sensitive at the domain level (the exact mechanism is an implementation concern):

- Payment webhook processing
- Order confirmation
- Inventory reservation
- Inventory consumption
- Inventory release
- Order creation (retries must not create duplicate orders)
- Payment creation / initiation
- External integration event processing (e.g., provider webhooks)

Requirement: repeated execution of the same operation must not produce duplicate business effects.

# 25. Domain Events

The MVP uses lightweight INTERNAL domain events (concepts). They are internal application events, not external integration events. No external event infrastructure (e.g., RabbitMQ, Kafka) is required for the MVP.

Events supported by the source documents:

- OrderCreated
- PaymentSucceeded
- PaymentFailed
- InventoryReserved
- InventoryReleased
- OrderCancelled
- SubscriptionExpired

Distinctions:

- Domain event concept: the business fact (e.g., "order was created").
- Integration event: an event intended for an external system. Not automatic in the MVP.
- Implementation mechanism: the delivery mechanism (in-process/in-application). Not prescribed here.

---

# 26. MVP Boundaries and Future / Deferred Areas

## MVP (FINAL)

The MVP domain includes the entities and state machines finalized in this document.

## Deferred / Future

The following are NOT part of the MVP domain model and must not be implemented without explicit approval:

- Advanced subscription billing (invoices, automated SaaS payments, PAST_DUE / CANCELLED / SUSPENDED subscription states)
- Refunds / refund automation (and refunded / partially_refunded states in any lifecycle)
- Abandoned-cart recovery
- Cart recovery
- Guest/customer cart merge
- Custom per-membership permission overrides
- Parent/child category hierarchy (referenced by the PRD; not in MVP scope; deferred)
- Checkout persistence (a checkout entity/table is explicitly prohibited unless approved)
- Inventory reservation EXPIRED or CONVERTED lifecycle states (prohibited)
- Advanced multi-region architecture
- Microservices
- Advanced event infrastructure (e.g., Kafka, complex event streaming)
- Multi-location inventory, warehouses
- Shipping provider integrations
- Discounts, coupons, gift cards, loyalty, reviews, wishlists
- Meta commerce, WhatsApp commerce, B2B, marketplace, app marketplace
- Advanced analytics, advanced search

---

# 27. Domain Model Rules for AI Agents

AI coding agents must:

- Read this document before modifying domain logic.
- Reuse existing entities where possible.
- Not create duplicate entities for the same business concept.
- Not introduce microservices.
- Not bypass domain boundaries.
- Not modify historical order data.
- Not bypass tenant isolation.
- Not introduce external providers as sources of truth.
- Not create future-scope domains without approval.
- Not introduce, remove, or alter core MVP entities, relationships, ownership boundaries, lifecycle states, or domain invariants without explicit Product Owner approval.
- Report ambiguous domain decisions before implementation.

# 28. Domain Decisions

## FINALIZED

The following decisions are FINAL and approved by the Product Owner:

1. **Product / ProductVariant:** Every Product MUST have at least one ProductVariant. A simple product uses a Default ProductVariant. ProductVariant is mandatory for every purchasable Product. Inventory belongs to ProductVariant. CartItem references ProductVariant. OrderItem references/snapshots ProductVariant information. Checkout operates on ProductVariants. There is NO nullable "product without variant" commerce path.

2. **Product / Category:** Product and Category have a MANY-TO-MANY relationship through ProductCategory. This MUST NOT be changed to 1:N.

3. **Checkout:** Checkout is NOT a persistent domain entity/table in the MVP. It is an application/domain orchestration boundary between Cart, checkout validation, inventory reservation, order creation, and payment initiation. No checkout table, entity, or persistence model.

4. **Customer / Guest Checkout:** Customer accounts are optional. Guest checkout is supported. A Customer is NOT required to create an Order. Customer identity and authentication identity remain conceptually separate.

5. **Cart Persistence:** Cart persistence is REQUIRED. A Cart belongs to a Store. A Cart may belong to an authenticated Customer or a guest session/cart token. No authentication is required for cart creation. No cart recovery, abandoned-cart recovery, or guest/customer merging in the MVP. The design must remain future-compatible with these capabilities.

6. **Order Status:** Order status is a separate state machine. MVP states: PENDING, CONFIRMED, PROCESSING, SHIPPED, DELIVERED, CANCELLED. Normal lifecycle: PENDING -> CONFIRMED -> PROCESSING -> SHIPPED -> DELIVERED. No arbitrary status transitions. No normal forward-state skipping. CANCELLED is terminal. Cancellation is allowed only from PENDING or CONFIRMED in the MVP. Cancellation must be auditable. Refund automation is OUT of MVP. refunded / partially_refunded are NOT MVP Order states.

7. **Payment Status:** Payment status is a separate state machine. MVP states: PENDING, PROCESSING, SUCCEEDED, FAILED. Normal flow: PENDING -> PROCESSING -> SUCCEEDED. Failure flow: PENDING -> PROCESSING -> FAILED. Order status != Payment status. Payment success may cause the approved Order transition to CONFIRMED.

8. **Payment Provider Abstraction:** The payment domain is provider-agnostic: Payment Domain -> Payment Provider Interface -> Provider Adapter -> Paymob. Future providers may include Paymob, Fawry, Cash on Delivery, and Stripe. The Order domain must not be coupled to Paymob.

9. **Inventory Reservation:** Available = On Hand - Reserved. Overselling must be prevented. Operations are concurrency-safe. Lifecycle: ACTIVE -> CONSUMED or ACTIVE -> RELEASED. Reservation occurs during checkout before payment initiation. Successful verified payment: ACTIVE -> CONSUMED. Payment failure / order cancellation / expiration: ACTIVE -> RELEASED. Release is idempotent. EXPIRED is NOT a separate lifecycle state (expiration is a reason that results in RELEASED). No two-phase reservation lifecycle. CONVERTED is NOT a domain lifecycle state.

10. **Store Status:** Store statuses are ACTIVE, DISABLED, SUSPENDED (semantics in Section 6.2). Subscription expiration is NOT a Store status. Store status and Subscription status are separate concepts. Subscription expiration is an access overlay.

11. **Subscription:** MVP states: TRIAL, ACTIVE, EXPIRED. Transitions: TRIAL -> ACTIVE, TRIAL -> EXPIRED, ACTIVE -> EXPIRED, EXPIRED -> ACTIVE. No PAST_DUE / CANCELLED / SUSPENDED in the MVP. Expiry: dashboard becomes read-only, storefront becomes disabled, commerce data is preserved, no automatic deletion. Reactivation is supported. Exact trial duration is a configurable business parameter.

12. **Membership / Authorization:** The domain contains User, Store, and StoreMembership. MVP roles: OWNER, ADMIN, STAFF. Fixed role-based authorization is used. No custom per-membership permission overrides in the MVP. The detailed permission matrix belongs to docs/AUTHORIZATION.md.

13. **Cart Token:** Guest cart identity uses an opaque random token that contains no business information. A Cart is always Store-scoped. Cart pricing is NOT authoritative. Checkout must revalidate product availability, variant availability, price, and inventory. No merge/recovery in the MVP. Cart expiration is supported.

## DEFERRED / FUTURE

The following are genuinely future decisions and are intentionally NOT part of the MVP domain model:

- Advanced subscription billing / invoices / automated SaaS payment lifecycle
- Refunds and refund automation
- Cart recovery, abandoned-cart recovery, guest/customer cart merge
- Custom permission overrides
- Parent/child category hierarchy
- Checkout persistence (requires explicit Product Owner approval)
- Additional reservation lifecycle states (EXPIRED as a state, CONVERTED, two-phase reservation)
- Advanced multi-region architecture, microservices, advanced event infrastructure
- Additional commerce domains (shipping, discounts, marketing, loyalty, reviews, B2B, marketplace)

There are NO unresolved core MVP domain decisions remaining.

---

# 29. Finalization Statement

This document is complete and final for the MVP.

The next agent may safely begin finalizing docs/DATABASE.md using this document as the authoritative domain source of truth.

Any change to this document's core content requires explicit Product Owner approval.
