# Ziad E-commerce — Domain Model

**Version:** 1.0  
**Status:** Draft  
**Owner:** Ziad  
**Technical Lead:** CTO / AI-assisted development

---

# 1. Purpose

This document defines the business domain model of the Ziad E-commerce SaaS platform.

It describes:

- Core business entities
- Relationships between entities
- Ownership boundaries
- Domain responsibilities
- Important business rules
- Domain events
- MVP boundaries

This document acts as the bridge between:

```text
Business Requirements
        ↓
Product Requirements
        ↓
Domain Model
        ↓
Database
        ↓
Application Code

AI coding agents must use this document as the business-domain reference.

AI agents must not invent new core entities or change domain relationships without explicit approval.

2. Domain Architecture

The system is a multi-tenant SaaS platform.

The fundamental ownership hierarchy is:

User
  ↓
Store Membership
  ↓
Store
  ↓
Commerce Data

Core commerce flow:

Store
  ↓
Catalog
  ↓
Product
  ↓
Variant
  ↓
Inventory

Customer
  ↓
Cart
  ↓
Checkout
  ↓
Order
  ↓
Payment

Storefront content:

Store
  ↓
CMS
  ├── Pages
  ├── Sections
  ├── Navigation
  └── Theme Configuration
3. Core Domains

The platform is divided into the following business domains:

Identity & Access
Tenancy & Stores
Catalog
Inventory
Customers
Cart
Checkout
Orders
Payments
CMS
Media
SaaS Billing
Integrations
Notifications
Analytics

Not every domain is part of MVP implementation.

4. Domain Ownership

Each domain owns its business rules.

Identity & Access

Responsible for:

Authentication identity
User profile
Store membership
Roles
Permissions
Tenancy & Stores

Responsible for:

Store creation
Store configuration
Store status
Store ownership
Store-level settings
Catalog

Responsible for:

Products
Variants
Categories
Product publishing
Product pricing
Product status

Catalog does not own inventory quantity.

Inventory

Responsible for:

Stock
Reservations
Inventory movements
Available quantity
Stock adjustments

Inventory does not own product descriptions or storefront content.

Customers

Responsible for:

Customer profiles
Customer identity within a store
Customer order history
Cart

Responsible for:

Active shopping carts
Cart items
Cart quantities
Cart validation
Checkout

Responsible for:

Checkout validation
Price validation
Inventory availability validation
Customer/shipping information
Order creation orchestration

Checkout does not own the final payment provider implementation.

Orders

Responsible for:

Orders
Order items
Order lifecycle
Order totals
Order status
Order cancellation rules
Payments

Responsible for:

Payment attempts
Payment status
Provider communication
Payment webhooks
Payment idempotency

Payments must be provider-independent.

CMS

Responsible for:

Store pages
Store sections
Store navigation
Theme configuration

CMS may read catalog information for presentation but must not own catalog data.

Media

Responsible for:

Uploaded files
Product media
Store assets
CMS media
5. Entity Model

The following entities are considered core to the platform.

5.1 User

Represents a platform user.

A User is an authenticated identity that can belong to one or more stores.

Example:

User
- id
- email
- name
- status

The authentication identity is managed by Supabase Auth.

The application maintains its own user profile and business relationships.

5.2 Store

Represents a merchant's online store.

A Store is the primary tenant boundary.

Example:

Store
- id
- name
- slug
- description
- currency
- timezone
- status

All merchant-owned commerce data must belong to a Store.

5.3 Store Membership

Represents the relationship between a User and a Store.

Example:

User
   ↓
Store Membership
   ↓
Store

A membership contains:

User
Store
Role
Status

Example roles:

OWNER
ADMIN
STAFF

A user may belong to multiple stores in the future.

5.4 Role

Defines a user's access level within a Store.

Initial roles:

OWNER
ADMIN
STAFF

Roles are store-scoped.

A user may have different roles in different stores.

6. Catalog Domain
6.1 Product

Represents a merchant's product.

A Product belongs to exactly one Store.

Example:

Store
  ↓
Product

Product contains:

Name
Description
Status
Category relationship
Media
Variants

Product statuses:

DRAFT
ACTIVE
ARCHIVED

A Product may contain one or more Variants.

6.2 Product Variant

A Variant represents a sellable version of a Product.

Example:

Product: T-Shirt

Variants:

Black / Small
Black / Medium
Black / Large
White / Small
White / Medium
White / Large

Each Variant can have:

SKU
Price
Compare-at price
Cost price
Variant options
Inventory

The Variant is the actual inventory-bearing and orderable entity.

Inventory belongs to the Variant, not directly to the Product.

6.3 Category

Represents a product category.

Categories belong to a Store.

Categories may support hierarchical relationships.

Example:

Electronics
   ├── Phones
   ├── Laptops
   └── Accessories

A Product may belong to a category according to the MVP product-category model.

The exact many-to-many vs single-category rule must remain consistent with the approved database specification.

6.4 Product Media

Represents media associated with a Product or Variant.

Examples:

Product image
Variant image
Gallery image

Media storage itself belongs to the Media domain.

Catalog stores the relationship between the media asset and the product/variant.

7. Inventory Domain
7.1 Inventory

Represents stock information for a Variant.

Inventory tracks:

On Hand
Reserved
Available

Formula:

Available = On Hand - Reserved

Inventory must never allow available quantity to become negative.

7.2 Inventory Reservation

Represents stock temporarily reserved for a checkout/order process.

Example:

Customer starts checkout
        ↓
Inventory Reservation
        ↓
Payment pending

Reservations may expire.

When a reservation expires:

Reserved ↓
Available ↑
7.3 Inventory Movement

Represents a historical inventory change.

Examples:

STOCK_IN
STOCK_OUT
ADJUSTMENT
RESERVATION
RELEASE
SALE
CANCELLATION

Inventory movements should provide an auditable history.

Inventory history should not be silently rewritten.

8. Customer Domain
8.1 Customer

Represents a customer belonging to a Store.

Customer is store-scoped.

Example:

Store A
 ├── Customer 1
 └── Customer 2

Store B
 └── Customer 1

The same person may exist as separate customer records across stores.

Customer may contain:

Name
Email
Phone
Address information
Order history
9. Cart Domain
9.1 Cart

Represents a customer's active shopping cart.

A cart belongs to a Store.

A cart may optionally be associated with a Customer.

Guest carts are supported.

9.2 Cart Item

Represents a Variant added to a Cart.

Cart Item contains:

Variant
Quantity

The cart does not permanently own the product price.

The final price must be validated during checkout.

10. Checkout Domain

Checkout is an orchestration domain.

Checkout validates:

Product
Variant
Price
Inventory
Customer
Shipping Information
Store

before creating an Order.

The frontend must never be considered authoritative for:

Price
Inventory
Order total
Payment result

The backend is authoritative.

11. Order Domain
11.1 Order

Represents a completed or pending customer purchase attempt.

An Order belongs to exactly one Store.

An Order belongs to one Customer where applicable.

Order contains:

Internal ID
Human-readable order number
Customer reference
Order items
Totals
Payment status
Order status
Shipping information
Creation timestamp
11.2 Order Item

Represents a purchased Variant.

An Order Item must snapshot purchase information.

At minimum:

Variant ID
Product Name Snapshot
Variant Name Snapshot
SKU Snapshot
Unit Price Snapshot
Quantity
Line Total

This prevents historical orders from changing when the catalog changes.

Example:

Product price today = 500 EGP

Customer buys product = 500 EGP

Merchant later changes price = 650 EGP

Historical Order Item remains = 500 EGP
11.3 Order Status

Initial order lifecycle:

PENDING
CONFIRMED
PROCESSING
SHIPPED
DELIVERED
CANCELLED

Exact allowed transitions must be enforced by business rules.

Example:

PENDING
   ↓
CONFIRMED
   ↓
PROCESSING
   ↓
SHIPPED
   ↓
DELIVERED

Cancellation is only allowed in eligible states.

11.4 Order Totals

Order totals must be calculated by the backend.

Conceptually:

Subtotal
+ Shipping
+ Tax
- Discount
= Total

The exact tax and discount rules are subject to approved product requirements.

Money must use integer minor units.

Example:

100.50 EGP
→ 10050 minor units
12. Shipping Information

Shipping is part of the Order data model.

MVP does not require third-party shipping-provider integration.

An Order may contain:

Shipping Name
Phone
Governorate
City
Address
Building
Apartment
Additional Information
Shipping Method
Shipping Cost

Shipping integrations may be added later.

13. Payment Domain
13.1 Payment

Represents a payment associated with an Order.

Payment contains:

Order
Amount
Currency
Provider
Status
Provider reference
13.2 Payment Attempt

A payment may have multiple attempts.

Example:

Order
  ↓
Payment Attempt #1
  ↓
FAILED

Payment Attempt #2
  ↓
SUCCESS

This prevents retries from creating duplicate Orders.

13.3 Payment Provider

Payments must use an abstraction.

Example:

PaymentProvider
      │
      ├── Paymob
      ├── Future Provider
      └── Future COD

The Order domain must not contain Paymob-specific business logic.

13.4 Payment Webhook

External payment providers may send duplicate webhook events.

Therefore payment events must support:

Provider event ID
Idempotency
Signature verification
Raw payload persistence
Processing status

Webhook processing must be safe to retry.

14. CMS Domain
14.1 Page

Represents a storefront page.

Examples:

Home
About
Contact
FAQ
14.2 Section

Represents a configurable section on a page.

Examples:

Hero
Banner
Featured Products
Category Grid
Text
Image

Sections can be ordered.

14.3 Theme Configuration

Stores storefront presentation configuration.

Examples:

Logo
Colors
Typography
Layout
Brand settings

Theme configuration must not contain core commerce data.

14.4 Navigation

Represents storefront navigation.

Examples:

Home
Shop
Categories
About
Contact

Navigation may reference CMS pages or catalog categories.

15. Media Domain

Media represents uploaded assets.

Media may be used by:

Products
Variants
Store
CMS

Actual binary files are stored in Supabase Storage.

The database stores metadata and ownership relationships.

Media must always be associated with the correct Store.

16. SaaS Billing Domain

SaaS Billing represents the merchant's subscription to Ziad E-commerce.

It is completely separate from customer payments.

SaaS Billing
    ≠
Commerce Payments

SaaS Billing controls:

Trial
Subscription
Subscription status
Expiration
Plan

When a subscription expires according to the approved business rules:

Admin
→ Read Only

Storefront
→ Disabled

Commerce data is retained.

17. Integrations Domain

External integrations must be isolated behind adapters.

Example:

Integrations
│
├── Paymob
├── Meta
└── Email

Integrations must not become sources of truth for core commerce data.

External systems are downstream or external collaborators.

18. Notifications Domain

Notifications react to business events.

Examples:

OrderCreated
PaymentSucceeded
OrderShipped
OrderDelivered

Notification channels may include:

Email
WhatsApp
SMS

Only approved MVP channels should be implemented.

Notification failure must not corrupt the underlying business transaction.

19. Analytics Domain

Analytics consumes business events.

Examples:

OrderCreated
PaymentSucceeded
ProductViewed
CustomerCreated

Analytics data may be eventually consistent.

Analytics must not block critical commerce operations.

20. Domain Relationships

High-level relationships:

User
 │
 └──< Store Membership >── Store
                              │
        ┌─────────────────────┼──────────────────────┐
        │                     │                      │
        ▼                     ▼                      ▼
     Catalog              Customers              CMS
        │
        ├── Product
        │     │
        │     └──< Variant
        │              │
        │              └── Inventory
        │
        └── Categories


Customer
   │
   └── Cart
         │
         └── Cart Items
                │
                └── Variant

Cart
  ↓
Checkout
  ↓
Order
  ├── Order Items
  ├── Customer
  ├── Shipping
  └── Payment
21. Cross-Domain Rules
Rule 1 — Store Isolation

Every store-owned entity must be associated with a Store.

Examples:

Product → Store
Variant → Product → Store
Inventory → Variant → Store
Customer → Store
Cart → Store
Order → Store
CMS → Store
Media → Store
Rule 2 — Backend Authority

The backend is authoritative for:

Price
Inventory
Order Total
Payment Status
Order Status
Permissions
Tenant Access
Rule 3 — Historical Data

Historical order data must not change because of future catalog changes.

Order items snapshot commercial information.

Rule 4 — Inventory Safety

Inventory operations must be transaction-safe.

The system must prevent:

Available < 0
Rule 5 — Payment Idempotency

Repeating the same payment callback must not create duplicate business effects.

Rule 6 — Tenant Authorization

Authentication alone is insufficient.

Every store-scoped operation must verify store membership and authorization.

Rule 7 — External Integrations

External integrations must not directly modify database records without passing through approved application logic.

22. Domain Events

Initial domain events:

StoreCreated

ProductCreated
ProductUpdated
ProductPublished
ProductArchived

InventoryAdjusted
InventoryReserved
InventoryReleased

CustomerCreated

CartCreated
CartUpdated

CheckoutStarted
CheckoutCompleted

OrderCreated
OrderConfirmed
OrderCancelled
OrderShipped
OrderDelivered

PaymentCreated
PaymentSucceeded
PaymentFailed

SubscriptionStarted
SubscriptionExpired

Domain events must be:

Explicit
Named consistently
Immutable
Safe to process more than once where applicable
23. Event Ownership

Example:

OrderCreated

Owned by:

Orders

Possible consumers:

Notifications
Analytics
Inventory

The event producer should not know the internal implementation of consumers.

24. Transaction Boundaries

Critical business operations must use database transactions where required.

Examples:

Order Creation
Validate Cart
     ↓
Validate Inventory
     ↓
Reserve Inventory
     ↓
Create Order
     ↓
Create Order Items
     ↓
Commit
Payment Confirmation
Receive Webhook
     ↓
Verify Signature
     ↓
Deduplicate Event
     ↓
Update Payment
     ↓
Update Order
     ↓
Confirm/Release Inventory as required
     ↓
Commit

Exact implementation must follow the approved payment state machine.

25. Concurrency Rules

The following operations are concurrency-sensitive:

Inventory reservation
Inventory release
Inventory adjustment
Checkout
Payment confirmation
Order cancellation

The system must use database-safe atomic operations and transactions.

Application-level read-then-write logic alone is not sufficient.

26. MVP Domains

The following domains are required for MVP:

Identity & Access
Tenancy & Stores
Catalog
Inventory
Customers
Cart
Checkout
Orders
Payments
CMS
Media
27. Deferred Domains

The following are intentionally deferred or simplified:

Meta Integration
Advanced Analytics
Advanced Search
Shipping Provider Integrations
Marketplace
App Marketplace
Advanced Notifications
Multi-location Inventory
Advanced SaaS Billing
AI Features

These must not be implemented unless explicitly approved.

28. Domain Model Rule for AI Agents

AI coding agents must:

Read this document before implementing business logic.
Respect domain ownership.
Never move business rules between domains without approval.
Never introduce a new core entity without approval.
Never bypass domain services for convenience.
Never allow frontend code to become the source of truth.
Never couple Orders directly to Paymob.
Never allow external integrations to bypass the application domain layer.
Preserve tenant isolation.
Preserve historical order snapshots.
Preserve inventory transaction safety.
Preserve payment idempotency.
29. Source of Truth Hierarchy

When documents appear to conflict, the following order must be followed:

1. Explicit approved business decision
2. BRD
3. PRD
4. Domain Model
5. Database Specification
6. Architecture Specification
7. AI Agent assumptions

AI agents must never resolve a business conflict by guessing.

If a conflict is discovered:

STOP
↓
REPORT CONFLICT
↓
ASK FOR DECISION
↓
CONTINUE ONLY AFTER APPROVAL
30. Final Domain Principle

The platform must remain simple internally even if the product becomes complex externally.

The MVP should prioritize:

Correctness
Security
Tenant Isolation
Data Integrity
Clear Domain Boundaries
Testability
Developer Velocity

over:

Premature Scalability
Microservices
Complex Infrastructure
Advanced Distributed Systems