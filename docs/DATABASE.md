# Ziad E-commerce — Database Specification

**Version:** 1.0  
**Status:** Draft  
**Owner:** Ziad  
**Architecture:** PostgreSQL + Supabase  
**Multi-tenancy:** Shared Schema + RLS

---

# 1. Database Principles

PostgreSQL is the authoritative transactional database.

The database must enforce critical data integrity through:

- Primary keys
- Foreign keys
- Unique constraints
- Check constraints
- Transactions
- Indexes
- Row-Level Security (RLS)

Application logic must not be the only protection for tenant isolation or critical business invariants.

---

# 2. Multi-Tenancy Model

The system is multi-tenant.

The primary tenant/business entity is the Store.

Conceptually:

Store
|
+-- Users
+-- Products
+-- Categories
+-- Inventory
+-- Customers
+-- Orders
+-- CMS
+-- Billing
+-- Integrations

Tenant-owned records must be associated with the appropriate Store.

---

# 3. Identity Model

Supabase Auth is responsible for authentication.

The application database stores application-level user information and store membership.

Conceptually:

auth.users
    |
    v
users
    |
    v
store_memberships
    |
    v
stores

The application must never duplicate authentication passwords in its own tables.

---

# 4. Core Tables

Initial MVP tables:

## Identity & Store

- users
- stores
- store_memberships

## Catalog

- products
- product_variants
- categories
- product_categories
- product_media

## Inventory

- inventory
- inventory_movements
- inventory_reservations

## Customers

- customers
- customer_addresses

## Commerce

- carts
- cart_items
- orders
- order_items

## Payments

- payments
- payment_events

## CMS

- pages
- page_sections
- store_settings

## Future-compatible

- subscriptions
- invoices
- external_integrations

These future-compatible tables should not be fully implemented until their corresponding features are approved.

---

# 5. Stores

Table:

stores

Purpose:

Represents a merchant's store.

Suggested fields:

- id
- name
- slug
- description
- logo_url
- status
- currency
- timezone
- created_at
- updated_at

Example:

Store A
- id: UUID
- name: Example Store
- slug: example-store
- currency: EGP
- timezone: Africa/Cairo

---

# 6. Users

Table:

users

Purpose:

Stores application-level user information.

Suggested fields:

- id
- auth_user_id
- first_name
- last_name
- email
- phone
- created_at
- updated_at

auth_user_id references Supabase Auth identity.

Passwords must NOT be stored here.

---

# 7. Store Memberships

Table:

store_memberships

Purpose:

Connects users to stores.

Suggested fields:

- id
- store_id
- user_id
- role
- status
- created_at
- updated_at

Roles initially:

- owner
- admin
- staff

A user may belong to more than one store in the future.

---

# 8. Products

Table:

products

Purpose:

Represents the logical product.

Suggested fields:

- id
- store_id
- name
- slug
- description
- status
- product_type
- created_at
- updated_at

Statuses:

- draft
- active
- archived

A product belongs to exactly one store.

---

# 9. Product Variants

Table:

product_variants

Purpose:

Represents the sellable version of a product.

Example:

Product:
Nike Air Max

Variants:

- Black / 42
- Black / 43
- White / 42

Suggested fields:

- id
- store_id
- product_id
- name
- sku
- price
- compare_at_price
- cost_price
- status
- created_at
- updated_at

A variant belongs to one product.

Inventory is tracked at variant level.

---

# 10. SKU

SKU means Stock Keeping Unit.

SKU is an internal merchant-defined identifier for a sellable variant.

Example:

Product:
Nike Air Max

Variant:
Black / 42

SKU:

NIKE-AIR-BLK-42

SKU must be unique within a store.

Global SKU uniqueness is NOT required.

---

# 11. Categories

Table:

categories

Purpose:

Organizes products.

Suggested fields:

- id
- store_id
- name
- slug
- description
- parent_id
- created_at
- updated_at

parent_id allows hierarchical categories.

Example:

Shoes
|
+-- Men
|
+-- Women

---

# 12. Product Categories

Table:

product_categories

Purpose:

Many-to-many relationship between products and categories.

Fields:

- product_id
- category_id

Composite uniqueness:

(product_id, category_id)

---

# 13. Product Media

Table:

product_media

Purpose:

References product images/media stored in Supabase Storage.

Suggested fields:

- id
- store_id
- product_id
- variant_id nullable
- storage_path
- media_type
- alt_text
- sort_order
- created_at

The database stores metadata and storage references.

Binary media must not be stored directly in PostgreSQL.

---

# 14. Inventory

Table:

inventory

Purpose:

Stores current inventory state for each variant.

Suggested fields:

- id
- store_id
- variant_id
- on_hand_quantity
- reserved_quantity
- created_at
- updated_at

Invariant:

available_quantity =
on_hand_quantity - reserved_quantity

Quantities must not become negative.

Inventory operations must be transaction-safe.

---

# 15. Inventory Movements

Table:

inventory_movements

Purpose:

Immutable audit history of inventory changes.

Suggested fields:

- id
- store_id
- variant_id
- movement_type
- quantity
- reference_type
- reference_id
- reason
- created_at

Movement types may include:

- stock_in
- manual_adjustment
- sale
- return
- reservation
- reservation_release

Inventory history must not be silently overwritten.

---

# 16. Inventory Reservations

Table:

inventory_reservations

Purpose:

Tracks temporary inventory reservations.

Suggested fields:

- id
- store_id
- variant_id
- cart_id nullable
- order_id nullable
- quantity
- status
- expires_at
- created_at
- released_at

Statuses:

- active
- released
- converted
- expired

Reservations must be concurrency-safe.

---

# 17. Customers

Table:

customers

Purpose:

Represents customers belonging to a store.

Suggested fields:

- id
- store_id
- email
- phone
- first_name
- last_name
- password_auth_user_id nullable
- status
- created_at
- updated_at

Customer authentication may be implemented separately from merchant authentication.

---

# 18. Customer Addresses

Table:

customer_addresses

Purpose:

Stores reusable customer addresses.

Suggested fields:

- id
- store_id
- customer_id
- label
- first_name
- last_name
- phone
- country
- governorate
- city
- address_line
- building
- apartment
- postal_code
- is_default
- created_at
- updated_at

---

# 19. Cart

Table:

carts

Suggested fields:

- id
- store_id
- customer_id nullable
- session_id nullable
- status
- currency
- created_at
- updated_at
- expires_at

Statuses:

- active
- converted
- abandoned
- expired

A cart may belong to a guest session or authenticated customer.

---

# 20. Cart Items

Table:

cart_items

Suggested fields:

- id
- cart_id
- product_id
- variant_id
- quantity
- created_at
- updated_at

Cart data is not authoritative inventory data.

The backend must revalidate:

- Product status
- Variant status
- Price
- Inventory

during checkout.

---

# 21. Orders

Table:

orders

Purpose:

Represents a completed checkout/order attempt.

Suggested fields:

- id
- store_id
- order_number
- customer_id nullable
- status
- payment_status
- fulfillment_status
- currency
- subtotal
- discount_total
- shipping_total
- tax_total
- grand_total
- customer_email
- customer_phone
- shipping_address_snapshot
- billing_address_snapshot
- idempotency_key
- created_at
- updated_at

order_number must be human-readable.

Example:

ORD-2026-000001

The internal UUID remains the primary key.

---

# 22. Order Items

Table:

order_items

Suggested fields:

- id
- order_id
- product_id nullable
- variant_id nullable
- product_name_snapshot
- variant_name_snapshot
- sku_snapshot
- unit_price
- quantity
- subtotal
- discount
- total
- created_at

Historical snapshots are mandatory.

Orders must not depend on the current product name or price.

---

# 23. Order Status

Initial order statuses:

- pending
- confirmed
- processing
- shipped
- delivered
- cancelled
- refunded

Order state transitions must be controlled by backend business rules.

The frontend must never directly set arbitrary order statuses.

---

# 24. Payment Status

Initial payment statuses:

- pending
- authorized
- paid
- failed
- refunded
- partially_refunded

Payment state is separate from order state.

---

# 25. Payments

Table:

payments

Purpose:

Represents payment attempts.

Suggested fields:

- id
- store_id
- order_id
- provider
- provider_payment_id
- amount
- currency
- status
- idempotency_key
- failure_code nullable
- failure_message nullable
- created_at
- updated_at

A single order may have multiple payment attempts.

---

# 26. Payment Events

Table:

payment_events

Purpose:

Stores provider webhook events.

Suggested fields:

- id
- store_id nullable
- provider
- provider_event_id
- event_type
- payload
- signature_verified
- processing_status
- processed_at nullable
- created_at

provider_event_id must be unique per provider.

Webhook processing must be idempotent.

---

# 27. CMS Pages

Table:

pages

Suggested fields:

- id
- store_id
- title
- slug
- status
- seo_title
- seo_description
- created_at
- updated_at

Statuses:

- draft
- published
- archived

---

# 28. Page Sections

Table:

page_sections

Purpose:

Stores structured page content.

Suggested fields:

- id
- store_id
- page_id
- section_type
- content
- sort_order
- created_at
- updated_at

content may use JSONB.

Example section types:

- hero
- featured_products
- category_grid
- text
- image
- banner

---

# 29. Store Settings

Table:

store_settings

Purpose:

Stores configurable store-level settings.

Suggested fields:

- id
- store_id
- settings

settings may use JSONB for flexible configuration.

Critical business data must NOT be hidden inside generic JSONB.

---

# 30. Future Billing

Future tables may include:

subscriptions
invoices

Billing is intentionally outside the first database implementation.

The database architecture must remain compatible with future SaaS billing.

---

# 31. Future Integrations

Future table:

external_integrations

Potential fields:

- id
- store_id
- provider
- status
- credentials_reference
- configuration
- last_sync_at
- created_at
- updated_at

Sensitive credentials must never be stored as plain text.

---

# 32. Primary Keys

UUIDs are preferred for internal primary keys.

Human-readable identifiers such as order numbers are separate fields.

Example:

id:
550e8400-e29b-41d4-a716-446655440000

order_number:
ORD-2026-000001

---

# 33. Foreign Keys

Relationships must use foreign keys wherever appropriate.

Examples:

products.store_id → stores.id

product_variants.product_id → products.id

inventory.variant_id → product_variants.id

orders.customer_id → customers.id

order_items.order_id → orders.id

payments.order_id → orders.id

---

# 34. Indexing Strategy

Indexes must support common access patterns.

Initial important indexes include:

- products(store_id)
- products(store_id, slug)
- product_variants(store_id)
- product_variants(product_id)
- product_variants(store_id, sku)
- inventory(store_id, variant_id)
- customers(store_id, email)
- orders(store_id, created_at)
- orders(store_id, order_number)
- order_items(order_id)
- payments(order_id)
- payment_events(provider, provider_event_id)

Indexes should be added based on real query patterns.

---

# 35. Unique Constraints

Examples:

Within a store:

products(store_id, slug)

product_variants(store_id, sku)

categories(store_id, slug)

orders(store_id, order_number)

payment_events(provider, provider_event_id)

The exact constraint strategy must be verified during implementation.

---

# 36. Soft Delete Policy

Soft deletion should NOT be applied blindly to every table.

Use statuses where business history matters.

Examples:

Products:
draft / active / archived

Orders:
cancelled / refunded

Inventory movements:
immutable

Financial records:
immutable

Physical deletion may be used for temporary entities when safe.

---

# 37. Money Representation

Money must never use floating-point values.

Use a fixed precision numeric/decimal strategy or integer minor units.

For EGP, the implementation must define a consistent representation.

The same representation must be used throughout:

- Products
- Orders
- Payments
- Discounts
- Shipping
- Taxes

---

# 38. Timestamps

All persisted records should use:

- created_at
- updated_at where applicable

Database timestamps should be stored consistently.

The application should handle timezone presentation separately from storage.

Store timezone is configured at the store level.

---

# 39. RLS Strategy

RLS must enforce tenant isolation.

Conceptually:

Authenticated user
        |
        v
Store membership
        |
        v
Authorized store
        |
        v
Tenant-owned rows

A user must only access rows belonging to stores for which they have valid membership.

The implementation must include automated RLS tests.

---

# 40. Database Transactions

Transactions are mandatory for operations requiring multiple dependent writes.

Examples:

- Checkout
- Order creation
- Inventory reservation
- Payment state updates
- Inventory adjustment

A failed transaction must not leave partial business state.

---

# 41. Concurrency

Concurrency-sensitive operations must use appropriate database mechanisms.

Examples:

- Atomic updates
- Row-level locking where appropriate
- Transactions
- Unique constraints

Read-then-write logic must not be used where it can produce race conditions.

---

# 42. Source of Truth

The platform database is authoritative for:

- Product data
- Variant data
- Inventory
- Customers
- Orders
- Payment state

External systems such as Meta are downstream integrations.

External catalog systems must never override the platform's authoritative inventory without explicit business rules.

---

# 43. Database Evolution

Schema changes must be performed through migrations.

Manual production schema changes are prohibited.

Every migration must be:

- Versioned
- Reviewable
- Reproducible
- Tested

---

# 44. MVP Scope

The following domains are approved for MVP:

- Authentication
- Stores
- Products
- Variants
- Categories
- Inventory
- Storefront
- Cart
- Checkout
- Orders
- Customers
- Paymob
- Basic CMS

The following are deferred:

- Meta / Facebook / Instagram
- Advanced Analytics
- Advanced Search
- SaaS Billing
- Full ETA Integration
- WhatsApp
- Multi-location Inventory
- Marketplace

---

# 45. Database Design Rule

No AI agent may create, remove, rename, or significantly modify database tables or relationships without updating this document and receiving explicit approval.

The database schema is a controlled architectural artifact.