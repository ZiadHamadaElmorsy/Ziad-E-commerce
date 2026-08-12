# Ziad E-commerce — Business Requirements Document

**Version:** 1.0
**Status:** Draft
**Product:** Ziad E-commerce
**Owner:** Ziad
**Technical Lead:** CTO / AI-assisted development

---

# 1. Document Purpose

This document defines the business requirements for the Ziad E-commerce SaaS MVP.

The BRD defines:

- Business objectives
- Target users
- User roles
- Core business processes
- Functional requirements
- Business rules
- MVP boundaries
- Acceptance criteria

This document is the primary business reference for product development.

Technical implementation details must not be invented from this document when they are not explicitly defined.

---

# 2. Product Vision

Ziad E-commerce is an Egypt-first SaaS platform that enables merchants to create and operate an online store without requiring technical expertise.

The platform provides merchants with:

- Store management
- Product management
- Inventory management
- Customer management
- Order management
- Payment processing
- Storefront management
- CMS capabilities
- SaaS subscription management

The platform should provide a simple experience while maintaining a technical foundation capable of supporting future growth.

---

# 3. Business Problem

Small and medium-sized merchants need a simple way to establish and operate an online store.

The platform should reduce the technical complexity required to:

- Create a store
- Publish products
- Manage stock
- Receive orders
- Process payments
- Manage customers
- Maintain storefront content

The product should focus initially on the Egyptian market rather than attempting to support every global commerce use case.

---

# 4. Target Users

## 4.1 Merchant

The primary user of the platform.

The merchant manages:

- Store
- Products
- Categories
- Inventory
- Customers
- Orders
- Storefront
- CMS
- Subscription

---

## 4.2 Store Staff

A merchant's staff member who can perform selected store operations according to assigned permissions.

---

## 4.3 Store Customer

A customer who purchases products through a merchant's storefront.

Customers may:

- Browse products
- Add products to cart
- Checkout
- Pay
- Receive order confirmation

Guest checkout is supported.

---

## 4.4 Platform Administrator

A future platform-level role responsible for managing the SaaS platform itself.

Platform administration is not part of the initial merchant MVP unless explicitly approved.

---

# 5. Business Goals

The MVP must validate that a merchant can successfully operate a basic online store.

Primary goals:

1. Reduce store setup complexity.
2. Enable merchants to manage products without technical knowledge.
3. Provide reliable inventory management.
4. Enable customers to place orders.
5. Support online payment through Paymob.
6. Provide a manageable storefront.
7. Establish a secure multi-tenant SaaS foundation.
8. Validate merchant demand before expanding functionality.

---

# 6. MVP Scope

The MVP includes:

- Authentication
- Store management
- Product management
- Variant management
- Category management
- Inventory
- Customers
- Cart
- Checkout
- Orders
- Paymob payments
- CMS
- Media
- Basic SaaS subscription state

The MVP does not attempt to reproduce the complete Shopify feature set.

---

# 7. User Roles and Permissions

Initial store roles:

```text
OWNER
ADMIN
STAFF
OWNER

Can:

Manage store
Manage users
Manage products
Manage inventory
Manage customers
Manage orders
Manage CMS
Manage subscription
ADMIN

Can:

Manage products
Manage inventory
Manage customers
Manage orders
Manage CMS

Subscription and ownership operations remain restricted according to the permission model.

STAFF

Permissions are limited to the capabilities assigned by the store administrator.

The detailed permission matrix will be defined separately in the authorization specification.

8. Store Management
BR-STORE-001 — Create Store

A merchant must be able to create a store after authentication.

Required information:

Store name
Store slug
Currency

Default MVP currency:

EGP
BR-STORE-002 — Store Configuration

Merchant can configure:

Store name
Description
Logo
Basic settings
Store status
BR-STORE-003 — Store Isolation

A merchant must only access data belonging to stores for which they have valid membership and authorization.

No merchant may access another store's:

Products
Customers
Orders
Inventory
CMS
Media
9. Product Management
BR-PRODUCT-001 — Create Product

Merchant can create a product.

Required information:

Product name
Description
Category
Product status

A product may contain one or more variants.

BR-PRODUCT-002 — Product Status

Supported statuses:

DRAFT
ACTIVE
ARCHIVED

Draft products must not be publicly purchasable.

Active products may appear on the storefront.

Archived products must not be newly purchasable.

BR-PRODUCT-003 — Edit Product

Merchant can update product information.

Changes must not modify historical order snapshots.

BR-PRODUCT-004 — Product Images

Merchant can:

Upload product images
Reorder product images
Remove product images

Media must remain associated with the correct store.

10. Variant Management
BR-VARIANT-001 — Create Variant

Merchant can create variants for a product.

Example:

T-Shirt
├── Black / Small
├── Black / Medium
└── Black / Large
BR-VARIANT-002 — Variant Pricing

Each variant can have:

Selling price
Compare-at price
Cost price where supported

Money must be represented using integer minor units.

BR-VARIANT-003 — SKU

A variant may have a SKU.

SKU must be unique according to the approved store-level uniqueness rule.

Barcode is not required for MVP.

BR-VARIANT-004 — Variant Inventory

Inventory is associated with the Variant.

A Product itself is not the inventory-bearing entity.

11. Category Management
BR-CATEGORY-001 — Create Category

Merchant can create categories.

A category belongs to a Store.

BR-CATEGORY-002 — Update Category

Merchant can update category information.

BR-CATEGORY-003 — Category Visibility

Categories may be active or inactive according to the approved product behavior.

Inactive categories must not be presented as active storefront categories.

12. Inventory Management
BR-INVENTORY-001 — View Inventory

Merchant can view:

On-hand quantity
Reserved quantity
Available quantity

Formula:

Available = On Hand - Reserved
BR-INVENTORY-002 — Adjust Inventory

Authorized merchant users can manually adjust inventory.

Every adjustment must produce an inventory movement record.

BR-INVENTORY-003 — Prevent Overselling

The system must prevent available inventory from becoming negative.

Inventory operations must be transaction-safe.

BR-INVENTORY-004 — Inventory Reservation

During checkout, available inventory may be temporarily reserved.

Reservation must be released when:

Checkout expires
Order is cancelled
Payment flow fails according to the approved payment state machine
13. Customer Management
BR-CUSTOMER-001 — Customer Creation

A customer may be created during checkout.

Customer records are store-scoped.

BR-CUSTOMER-002 — Customer Management

Authorized merchant users can:

View customers
Search customers
View customer details
View order history
BR-CUSTOMER-003 — Guest Checkout

Customers must be able to complete an order without creating a platform account.

The system may still create a customer record for merchant-side order management.

14. Cart
BR-CART-001 — Add Product

Customer can add an available variant to the cart.

BR-CART-002 — Update Quantity

Customer can increase or decrease item quantity.

The system must validate inventory availability.

BR-CART-003 — Remove Product

Customer can remove an item from the cart.

BR-CART-004 — Cart Price

Cart price information is not authoritative.

Final pricing must be revalidated by the backend during checkout.

15. Checkout
BR-CHECKOUT-001 — Checkout

Customer can proceed from Cart to Checkout.

Checkout collects:

Customer name
Phone
Email where applicable
Shipping address
Governorate
City
Additional address information
Payment method
BR-CHECKOUT-002 — Server Validation

The backend must validate:

Product availability
Variant availability
Current price
Quantity
Store status
Applicable shipping cost
Order totals

Client-provided totals must never be trusted.

BR-CHECKOUT-003 — Order Creation

A valid checkout may create an Order.

Order creation must be idempotent.

Repeated checkout requests must not create duplicate orders.

16. Orders
BR-ORDER-001 — Create Order

An order is created after successful checkout validation.

BR-ORDER-002 — Order Items

Order Items must preserve purchase-time information.

At minimum:

Product name
Variant name
SKU
Unit price
Quantity
Line total

Future product changes must not change historical order information.

BR-ORDER-003 — Order Status

Initial statuses:

PENDING
CONFIRMED
PROCESSING
SHIPPED
DELIVERED
CANCELLED
BR-ORDER-004 — Order Management

Authorized merchant users can:

View orders
Search orders
Filter orders
View order details
Update eligible order statuses
Cancel eligible orders
BR-ORDER-005 — Order Number

Each order must have:

Internal immutable identifier
Human-readable order number

The internal identifier must not be exposed as the primary customer-facing order reference.

17. Payment
BR-PAYMENT-001 — Payment Provider

The MVP payment provider is:

Paymob
BR-PAYMENT-002 — Payment Attempt

An order may have one or more payment attempts.

A failed payment attempt must not create a second order automatically.

BR-PAYMENT-003 — Payment Confirmation

Payment confirmation must rely on a verified provider response/webhook.

A browser redirect alone must not be treated as authoritative payment confirmation.

BR-PAYMENT-004 — Webhook Security

Payment webhooks must:

Verify authenticity/signature
Deduplicate events
Persist provider event identifiers
Be safe to retry
BR-PAYMENT-005 — Payment Idempotency

Processing the same payment event multiple times must not produce duplicate business effects.

18. Storefront
BR-STOREFRONT-001 — Public Store

Each active store must have a public storefront.

BR-STOREFRONT-002 — Product Listing

Customers can browse active products.

BR-STOREFRONT-003 — Product Details

Customers can view:

Product name
Description
Images
Variants
Price
Availability
BR-STOREFRONT-004 — SEO

The storefront must use SEO-friendly rendering.

The implementation should use Next.js SSR/ISR where appropriate.

BR-STOREFRONT-005 — Responsive Design

The storefront must support:

Desktop
Tablet
Mobile
19. CMS
BR-CMS-001 — Pages

Merchant can create and manage basic storefront pages.

Examples:

Home
About
Contact
FAQ
BR-CMS-002 — Sections

Merchant can configure homepage sections.

Initial section types may include:

Hero
Banner
Featured Products
Category Grid
Text
Image
BR-CMS-003 — Navigation

Merchant can configure basic storefront navigation.

Navigation may reference:

Pages
Categories
Storefront destinations
BR-CMS-004 — Theme

Merchant can configure basic branding:

Logo
Colors
Typography
Basic layout configuration

The MVP does not include a full visual drag-and-drop page builder.

20. Media
BR-MEDIA-001 — Upload

Authorized merchant users can upload media.

Supported use cases:

Product images
Store logo
CMS images
BR-MEDIA-002 — Tenant Isolation

Media must be isolated by Store.

A merchant must never be able to access another store's media.

21. SaaS Subscription
BR-SUB-001 — Trial

A merchant may receive an initial free trial.

The exact duration is a product decision and must be configured rather than hard-coded.

BR-SUB-002 — Active Subscription

An active subscription allows normal store operation.

BR-SUB-003 — Expired Subscription

When a subscription expires according to the approved business rules:

Admin Dashboard
→ Read Only

Public Storefront
→ Disabled

Merchant commerce data must be retained.

22. Security Requirements

The following are mandatory:

Authentication
Authorization
Tenant isolation
PostgreSQL RLS
Input validation
Secure secret management
Webhook verification
Idempotency
Rate limiting
Audit logging for sensitive operations
23. Business Rules
BR-RULE-001

The database is the source of truth for commerce data.

BR-RULE-002

The backend is authoritative for:

Prices
Inventory
Order totals
Payment state
Order state
Authorization
BR-RULE-003

External integrations must not become the source of truth for core commerce data.

BR-RULE-004

All store-owned records must be tenant-isolated.

BR-RULE-005

Historical orders must preserve purchase-time commercial information.

BR-RULE-006

Inventory must be concurrency-safe.

BR-RULE-007

Payment events must be idempotent.

BR-RULE-008

A failed payment must not automatically create a duplicate order.

BR-RULE-009

A customer cannot purchase an unavailable variant.

BR-RULE-010

Archived or inactive products cannot be newly purchased.

24. Non-Functional Requirements
Performance

The MVP should provide responsive user interactions under normal expected merchant traffic.

No premature distributed architecture should be introduced solely for hypothetical scale.

Security

Security controls must be implemented before production deployment.

Reliability

Critical operations must be recoverable and safe to retry.

Critical operations include:

Checkout
Order creation
Payment processing
Inventory reservation
Payment webhook processing
Observability

The system should provide:

Structured logs
Error tracking
Basic metrics
Request correlation identifiers
25. MVP Acceptance Criteria

The MVP is considered business-complete when a merchant can:

Register.
Login.
Create a store.
Configure the store.
Upload a logo.
Create a category.
Create a product.
Create variants.
Set prices.
Set inventory.
Publish products.
Open the storefront.
Browse products.
Add products to cart.
Checkout as a guest.
Provide shipping information.
Initiate payment.
Complete payment through Paymob.
Receive a confirmed order.
View the order in Admin.
View customer information.
View inventory changes.
Update eligible order statuses.
Edit storefront content.
Continue operating while subscription/trial is active.
Become read-only and storefront-disabled after subscription expiration according to the approved rules.
26. Requirements Traceability

Every implementation feature must reference a requirement ID.

Example:

Feature:
Create Product

Requirement:
BR-PRODUCT-001

Tests:
- Create valid product
- Reject missing name
- Reject unauthorized store
- Reject cross-tenant access

AI coding agents must preserve this traceability.

27. Requirement Change Policy

Any change affecting:

Business behavior
Domain boundaries
Data ownership
Security
Payment behavior
Inventory behavior
Tenant isolation

must be documented before implementation.

AI agents must not silently modify requirements.

28. Product Principle

The MVP must optimize for:

Simple
Reliable
Secure
Testable
Usable
The product should establish a strong foundation for future expansion without implementing future complexity prematurely. 