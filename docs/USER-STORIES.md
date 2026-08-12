# Ziad E-commerce — User Stories

**Version:** 1.0
**Status:** Draft
**Owner:** Ziad
**Technical Lead:** CTO / AI-assisted development

---

# 1. Purpose

This document defines the MVP user stories for the Ziad E-commerce SaaS platform.

Each user story represents a user-facing business capability that must be implemented and tested.

User stories are derived from:

- ARCHITECTURE.md
- MVP-SCOPE.md
- BRD.md
- PRD.md
- DOMAIN-MODEL.md
- API-SPEC.md

AI coding agents must not implement functionality that is not represented by an approved user story or explicitly approved technical task.

---

# 2. Story Format

Each story contains:

- Story ID
- Epic
- Priority
- User Story
- Acceptance Criteria
- Dependencies

Priority levels:

```text
P0 = Critical / Required for MVP
P1 = Important / Required for usable MVP
P2 = Nice to have / Can be deferred
3. EPIC: Authentication
US-AUTH-001 — Merchant Registration

Priority: P0

User Story

As a merchant,
I want to create an account,
so that I can access the platform and create my store.

Acceptance Criteria
Merchant can provide required registration information.
Invalid registration data is rejected.
Successful registration creates an authenticated user.
Duplicate account registration is handled safely.
Merchant is redirected to the appropriate onboarding/dashboard flow.
Authentication is handled through Supabase Auth.
Dependencies
Supabase Auth
User
StoreMembership
US-AUTH-002 — Merchant Login

Priority: P0

User Story

As a merchant,
I want to log in,
so that I can access my store dashboard.

Acceptance Criteria
Valid credentials allow login.
Invalid credentials are rejected.
Authenticated session is established.
Protected routes cannot be accessed without authentication.
Dependencies
Supabase Auth
User
StoreMembership
US-AUTH-003 — Merchant Logout

Priority: P0

User Story

As a merchant,
I want to log out,
so that my authenticated session is terminated.

Acceptance Criteria
Merchant can log out.
Session becomes invalid.
Protected resources cannot be accessed after logout.
US-AUTH-004 — Password Reset

Priority: P1

User Story

As a merchant,
I want to reset my password,
so that I can recover access to my account.

Acceptance Criteria
Merchant can request password reset.
Reset process uses Supabase Auth.
Invalid or expired reset attempts are handled safely.
4. EPIC: Store Management
US-STORE-001 — Create Store

Priority: P0

User Story

As a merchant,
I want to create my store,
so that I can start selling products online.

Acceptance Criteria
Authenticated merchant can create a store.
Store name is required.
Store slug is generated/validated.
Currency defaults to EGP.
Merchant becomes associated with the Store.
Store data is isolated from other stores.
Dependencies
Authentication
User
Store
StoreMembership
RLS
US-STORE-002 — View Store Settings

Priority: P0

User Story

As a merchant,
I want to view my store settings,
so that I know how my store is configured.

Acceptance Criteria
Merchant can view current Store settings.
Merchant can only access their authorized Store.
Store configuration is displayed correctly.
US-STORE-003 — Update Store Settings

Priority: P0

User Story

As a merchant,
I want to update my store settings,
so that I can configure my business information.

Acceptance Criteria
Merchant can update allowed Store fields.
Unauthorized fields cannot be modified.
Changes are persisted.
Changes do not affect other stores.
US-STORE-004 — Configure Store Branding

Priority: P1

User Story

As a merchant,
I want to configure my logo and basic branding,
so that my storefront represents my business.

Acceptance Criteria
Merchant can upload a logo.
Merchant can configure basic branding.
Uploaded media belongs to the Store.
Storefront displays the configured branding.
5. EPIC: Merchant Dashboard
US-DASH-001 — View Dashboard

Priority: P1

User Story

As a merchant,
I want to see an overview of my store,
so that I can quickly understand its current state.

Acceptance Criteria

Dashboard displays:

Order count
Revenue
Product count
Inventory status
Recent orders

Data must be limited to the current Store.

6. EPIC: Product Management
US-PROD-001 — Create Product

Priority: P0

User Story

As a merchant,
I want to create a product,
so that I can sell it through my storefront.

Acceptance Criteria
Merchant can create a Product.
Product name is required.
Product belongs to current Store.
Product starts in the appropriate initial status.
Unauthorized users cannot create products in another Store.
US-PROD-002 — Edit Product

Priority: P0

User Story

As a merchant,
I want to edit product information,
so that my catalog remains accurate.

Acceptance Criteria
Merchant can edit allowed Product fields.
Validation is applied.
Product remains associated with the same Store.
Changes are reflected in the Storefront where applicable.
US-PROD-003 — Publish Product

Priority: P0

User Story

As a merchant,
I want to publish a product,
so that customers can purchase it.

Acceptance Criteria
Merchant can publish a valid Product.
Published Product becomes visible on the Storefront.
Invalid Products cannot be published.
Only authorized Store users can publish Products.
US-PROD-004 — Unpublish Product

Priority: P0

User Story

As a merchant,
I want to unpublish a product,
so that customers can no longer purchase it.

Acceptance Criteria
Product can be unpublished.
Product is removed from public Storefront availability.
Historical orders remain unchanged.
US-PROD-005 — Archive Product

Priority: P1

User Story

As a merchant,
I want to archive a product,
so that I can remove it from active catalog management without deleting historical data.

Acceptance Criteria
Product can be archived.
Archived Product is not purchasable.
Historical OrderItems remain unchanged.
Product data is not physically deleted by default.
7. EPIC: Product Variants
US-VAR-001 — Create Product Variant

Priority: P0

User Story

As a merchant,
I want to create variants,
so that one product can have different purchasable options.

Acceptance Criteria
Variant belongs to a Product.
Variant belongs to the same Store as its Product.
Variant can have a name/options.
Variant can have SKU.
Variant can have price.
Variant can have compare-at price.
Variant can have inventory.
US-VAR-002 — Update Product Variant

Priority: P0

User Story

As a merchant,
I want to edit a variant,
so that its price and product options remain accurate.

Acceptance Criteria
Merchant can update allowed variant fields.
SKU validation is applied where required.
Variant cannot be moved across stores.
Historical OrderItems are not modified.
US-VAR-003 — Archive Product Variant

Priority: P1

User Story

As a merchant,
I want to archive a variant,
so that it is no longer available for purchase.

Acceptance Criteria
Variant can be archived.
Archived Variant cannot be added to new carts.
Historical orders remain unchanged.
8. EPIC: Categories
US-CAT-001 — Create Category

Priority: P0

User Story

As a merchant,
I want to create categories,
so that I can organize my catalog.

Acceptance Criteria
Merchant can create Category.
Category belongs to current Store.
Category name is required.
US-CAT-002 — Assign Product to Category

Priority: P0

User Story

As a merchant,
I want to assign products to categories,
so that customers can discover products easily.

Acceptance Criteria
Product can be assigned to Category.
Product and Category must belong to same Store.
Duplicate relationships are prevented.
US-CAT-003 — Manage Categories

Priority: P1

User Story

As a merchant,
I want to edit and archive categories,
so that my catalog organization stays accurate.

Acceptance Criteria
Category can be edited.
Category can be archived.
Existing Products are not accidentally deleted.
Historical Orders remain unchanged.
9. EPIC: Inventory
US-INV-001 — Set Initial Inventory

Priority: P0

User Story

As a merchant,
I want to set product inventory,
so that customers cannot purchase unavailable products.

Acceptance Criteria
Inventory is associated with ProductVariant.
Merchant can set initial quantity.
Available quantity is calculated correctly.
Inventory cannot become invalid/negative.
US-INV-002 — Adjust Inventory

Priority: P0

User Story

As a merchant,
I want to adjust inventory,
so that I can correct or update stock quantities.

Acceptance Criteria
Merchant can adjust inventory.
Adjustment has a reason.
Adjustment is atomic.
InventoryMovement is recorded.
Audit information is retained.
US-INV-003 — Prevent Overselling

Priority: P0

User Story

As a merchant,
I want the system to prevent overselling,
so that I do not accept orders for unavailable inventory.

Acceptance Criteria
Concurrent checkout attempts are handled safely.
Inventory cannot be decremented below allowed availability.
Reservation logic is transaction-safe.
Failed checkout releases applicable reservations.
US-INV-004 — Inventory Reservation

Priority: P0

User Story

As the system,
I want to reserve inventory during checkout,
so that concurrent customers cannot purchase the same stock.

Acceptance Criteria
Reservation has quantity.
Reservation has expiration.
Reservation belongs to the appropriate Store and Variant.
Reservation can be released.
Successful payment can consume the reservation.
Expired reservations can be released.
10. EPIC: Customers
US-CUST-001 — Create Customer During Checkout

Priority: P0

User Story

As the system,
I want to create or identify a customer during checkout,
so that orders can be associated with customers.

Acceptance Criteria
Customer information is validated.
Customer belongs to current Store.
Existing customer can be identified where applicable.
Customer data cannot cross Store boundaries.
US-CUST-002 — View Customers

Priority: P1

User Story

As a merchant,
I want to view my customers,
so that I can understand who has purchased from my store.

Acceptance Criteria
Merchant can list Customers.
Search is supported.
Pagination is supported.
Only current Store customers are returned.
US-CUST-003 — View Customer Order History

Priority: P1

User Story

As a merchant,
I want to see a customer's order history,
so that I can understand their previous purchases.

Acceptance Criteria
Merchant can open a Customer.
Customer's Orders are displayed.
Orders belong to the same Store.
Historical order information remains accurate.
11. EPIC: Cart
US-CART-001 — Add Product to Cart

Priority: P0

User Story

As a customer,
I want to add a product variant to my cart,
so that I can purchase it later.

Acceptance Criteria
Customer can select a valid Variant.
Quantity must be valid.
Variant must be purchasable.
Cart belongs to correct Store.
Cart does not blindly trust client-provided price.
US-CART-002 — Update Cart Quantity

Priority: P0

User Story

As a customer,
I want to change product quantity,
so that I can control how many units I purchase.

Acceptance Criteria
Quantity is validated.
Invalid quantities are rejected.
Product availability is checked where appropriate.
US-CART-003 — Remove Cart Item

Priority: P0

User Story

As a customer,
I want to remove a product from my cart,
so that I can change my purchase.

Acceptance Criteria
Item is removed from the correct Cart.
Other Stores' carts cannot be affected.
12. EPIC: Storefront
US-STF-001 — Browse Storefront

Priority: P0

User Story

As a customer,
I want to browse a merchant's storefront,
so that I can discover products.

Acceptance Criteria
Public storefront is accessible for active Stores.
Expired/disabled Stores are not publicly purchasable.
Store branding is displayed.
Storefront is responsive.
US-STF-002 — Browse Products

Priority: P0

User Story

As a customer,
I want to browse products,
so that I can discover what the merchant sells.

Acceptance Criteria
Only published Products are publicly visible.
Archived/unpublished Products are excluded.
Products belong to the requested Store.
Product information is accurate.
US-STF-003 — View Product Details

Priority: P0

User Story

As a customer,
I want to view product details,
so that I can decide whether to purchase the product.

Acceptance Criteria

Product page displays:

Name
Description
Images
Variants
Price
Availability
US-STF-004 — Search Products

Priority: P1

User Story

As a customer,
I want to search products by name,
so that I can find products quickly.

Acceptance Criteria
Search operates within current Store.
Search uses product name.
Search does not expose another Store's Products.
Empty results are handled gracefully.
13. EPIC: CMS
US-CMS-001 — Manage Pages

Priority: P1

User Story

As a merchant,
I want to create and manage storefront pages,
so that I can provide information to customers.

Acceptance Criteria

Merchant can:

Create Page
Edit Page
View Page
Archive Page
US-CMS-002 — Manage Homepage Sections

Priority: P1

User Story

As a merchant,
I want to configure homepage sections,
so that I can customize my storefront.

Acceptance Criteria

Merchant can configure supported section types:

Hero
Banner
Featured Products
Category Grid
Text
Image

Sections have a defined order.

US-CMS-003 — Reorder Sections

Priority: P1

User Story

As a merchant,
I want to reorder homepage sections,
so that I can control the storefront layout.

Acceptance Criteria
Merchant can change section order.
New order is persisted.
Storefront reflects the new order.
US-CMS-004 — Configure Theme

Priority: P1

User Story

As a merchant,
I want to configure basic theme settings,
so that my storefront reflects my brand.

Acceptance Criteria

Merchant can configure approved theme properties.

Changes affect only the current Store.

14. EPIC: Media
US-MEDIA-001 — Upload Media

Priority: P0

User Story

As a merchant,
I want to upload images,
so that I can use them in products and storefront content.

Acceptance Criteria
Media is uploaded through approved storage flow.
Media is associated with the current Store.
Unsupported files are rejected.
File size limits are enforced.
Unauthorized users cannot access private Store media.
US-MEDIA-002 — Delete Media

Priority: P1

User Story

As a merchant,
I want to delete unused media,
so that I can manage storage.

Acceptance Criteria
Merchant can delete authorized media.
Media belonging to another Store cannot be deleted.
References are handled safely.
15. EPIC: Checkout
US-CHECK-001 — Start Checkout

Priority: P0

User Story

As a customer,
I want to start checkout,
so that I can provide the information required to place my order.

Acceptance Criteria

Customer provides:

Name
Phone
Email where applicable
Governorate
City
Address

Backend validates all required data.

US-CHECK-002 — Revalidate Checkout

Priority: P0

User Story

As the system,
I want to revalidate cart information during checkout,
so that customers cannot manipulate prices or inventory.

Acceptance Criteria

Backend recalculates:

Product prices
Quantities
Inventory
Order subtotal
Shipping cost
Total

Client-provided totals are ignored as authoritative values.

US-CHECK-003 — Create Order From Checkout

Priority: P0

User Story

As a customer,
I want my checkout to create an order,
so that my purchase is recorded.

Acceptance Criteria
Order is created transactionally.
OrderItems contain historical snapshots.
Inventory reservation is created where applicable.
Duplicate checkout attempts are handled idempotently.
Order belongs to the correct Store.
16. EPIC: Payments
US-PAY-001 — Initiate Payment

Priority: P0

User Story

As a customer,
I want to pay for my order,
so that I can complete my purchase.

Acceptance Criteria
Payment attempt is created.
Paymob integration is invoked through backend-controlled flow.
Client cannot modify payment amount.
Idempotency is applied.
US-PAY-002 — Process Successful Payment

Priority: P0

User Story

As the system,
I want to process a successful Paymob payment,
so that the order becomes confirmed.

Acceptance Criteria
Payment event authenticity is verified.
Event is persisted.
Duplicate event is not processed twice.
Payment state becomes successful.
Order is updated according to approved transition rules.
Inventory reservation is consumed appropriately.
US-PAY-003 — Process Failed Payment

Priority: P0

User Story

As the system,
I want to process failed payments,
so that unsuccessful transactions do not incorrectly confirm orders.

Acceptance Criteria
Failed payment is recorded.
Order is not incorrectly marked paid.
Reservation is released according to business rules.
Customer receives appropriate feedback.
17. EPIC: Orders
US-ORDER-001 — Merchant View Orders

Priority: P0

User Story

As a merchant,
I want to view orders,
so that I can manage customer purchases.

Acceptance Criteria
Merchant can list orders.
Pagination works.
Search works.
Status filtering works.
Orders are Store-scoped.
US-ORDER-002 — Merchant View Order Details

Priority: P0

User Story

As a merchant,
I want to view order details,
so that I can fulfill the customer's purchase.

Acceptance Criteria

Order details include:

Customer
Items
Quantity
Historical prices
Shipping information
Payment status
Order status
Totals
US-ORDER-003 — Update Order Status

Priority: P0

User Story

As a merchant,
I want to update order status,
so that I can track fulfillment progress.

Acceptance Criteria
Only authorized status transitions are accepted.
Invalid transitions are rejected.
Changes are audited.
Customer-facing state is updated where applicable.
18. EPIC: Subscription
US-SUB-001 — Start Trial

Priority: P1

User Story

As a merchant,
I want to start a trial,
so that I can evaluate the platform before subscribing.

Acceptance Criteria
Trial is associated with Store.
Trial has a start date.
Trial has an expiration date.
Trial status is tracked.
US-SUB-002 — Enforce Expired Subscription

Priority: P1

User Story

As the system,
I want to restrict expired stores,
so that subscription access rules are enforced.

Acceptance Criteria

When subscription expires:

Merchant Dashboard
→ Read Only

Storefront
→ Disabled

Commerce data is retained.

19. EPIC: Notifications
US-NOTIF-001 — Order Confirmation

Priority: P1

User Story

As a customer,
I want to receive an order confirmation,
so that I know my order was successfully recorded.

Acceptance Criteria
Confirmation is triggered only after the appropriate order state.
Notification contains order reference.
Notification does not expose sensitive information.
Notification failure does not corrupt the Order transaction.
20. EPIC: Audit
US-AUDIT-001 — Audit Important Merchant Actions

Priority: P1

User Story

As a platform administrator,
I want important merchant actions to be auditable,
so that changes can be investigated.

Acceptance Criteria

Audit events are recorded for approved actions including:

Product changes
Inventory adjustments
Order status changes
Store settings changes
Permission changes

Audit records include:

Actor
Store
Action
Target
Timestamp
21. EPIC: Multi-Tenancy & Security
US-SEC-001 — Isolate Store Data

Priority: P0

User Story

As a merchant,
I want my store data isolated,
so that another merchant cannot access it.

Acceptance Criteria
Store A cannot read Store B data.
Store A cannot modify Store B data.
Store A cannot delete Store B data.
Direct ID manipulation does not bypass authorization.
PostgreSQL RLS enforces tenant isolation.
Automated tests verify cross-tenant access attempts.
US-SEC-002 — Validate Authorization

Priority: P0

User Story

As the system,
I want every protected action to verify permissions,
so that users cannot perform unauthorized operations.

Acceptance Criteria
Authentication is verified.
Store membership is verified.
Role/permission is verified.
Unauthorized requests are rejected.
22. EPIC: Reliability
US-REL-001 — Idempotent Critical Operations

Priority: P0

User Story

As the system,
I want critical operations to be idempotent,
so that retries do not create duplicate business records.

Acceptance Criteria

Idempotency is enforced for applicable operations including:

Order creation
Payment initiation
Payment webhook processing
Inventory reservation

Repeated requests with the same valid idempotency key must not create duplicate business outcomes.

US-REL-002 — Safe Webhook Processing

Priority: P0

User Story

As the system,
I want external webhooks to be processed safely,
so that provider retries cannot corrupt business state.

Acceptance Criteria
Signature/authenticity is verified.
Provider event ID is deduplicated.
Raw event is persisted where required.
Processing can be retried safely.
Duplicate events do not create duplicate Orders/Payments.
23. EPIC: SEO
US-SEO-001 — SEO-Friendly Storefront

Priority: P1

User Story

As a merchant,
I want my storefront to be search-engine friendly,
so that customers can discover my products.

Acceptance Criteria
Storefront uses SEO-friendly URLs.
Public pages expose metadata.
Product pages expose relevant metadata.
Server-rendered or statically generated content is used where appropriate.
Public content is accessible to search engines.
24. MVP Priority Summary
P0 — Critical
Authentication
Store Creation
Store Isolation
Products
Variants
Categories
Inventory
Cart
Checkout
Orders
Payments
Storefront
Critical Security
Idempotency
Webhook Safety
P1 — Important
Dashboard
Customers
CMS
Theme
Media Management
Subscriptions
Notifications
Audit Logging
SEO
P2 — Deferred

No P2 feature is required to declare the core MVP operational.

Future features must not enter implementation unless explicitly approved.

25. Story Dependencies

The primary implementation dependency graph is:

Authentication
      ↓
Store
      ↓
StoreMembership
      ↓
Catalog
      ↓
Variants
      ↓
Inventory
      ↓
Storefront
      ↓
Cart
      ↓
Checkout
      ↓
Orders
      ↓
Payments
      ↓
Notifications

CMS and Media:

Store
  ↓
Media
  ↓
CMS
  ↓
Storefront

Subscription:

Store
  ↓
Subscription
  ↓
Store Access
26. Story Implementation Rules

An AI coding agent must implement stories in small increments.

For each story:

Read Story
↓
Read Relevant Architecture
↓
Read Domain Model
↓
Read API Contract
↓
Identify Required Database Changes
↓
Implement Backend
↓
Implement Frontend
↓
Write Tests
↓
Run Tests
↓
Fix Issues
↓
Review
↓
Commit

The agent must not implement multiple unrelated stories in one uncontrolled change.

27. Story Completion Criteria

A User Story is DONE only when:

Acceptance Criteria are satisfied.
Backend implementation exists where required.
Frontend implementation exists where required.
Validation exists.
Authorization exists.
Tenant isolation is preserved.
Automated tests exist for critical behavior.
No known critical regression exists.
Relevant documentation is updated.
Code passes linting/type checking/tests.
The change is committed to Git.
28. Definition of MVP Completion

The MVP is complete when all P0 stories are DONE and all critical P1 stories required for a usable merchant experience are DONE.

The complete end-to-end flow must work:

Register
↓
Create Store
↓
Create Product
↓
Create Variant
↓
Set Inventory
↓
Publish Product
↓
Customer Visits Storefront
↓
Browse Product
↓
Add to Cart
↓
Checkout
↓
Inventory Validation / Reservation
↓
Order Creation
↓
Paymob Payment
↓
Verified Payment Event
↓
Payment Confirmation
↓
Order Confirmation
↓
Merchant Manages Order

No feature outside approved MVP scope is required for MVP completion.