# Ziad E-commerce — MVP Scope

**Version:** 1.0  
**Status:** Draft  
**Owner:** Ziad  
**Technical Lead:** CTO / AI-assisted development

---

# 1. Purpose

This document defines the exact scope of the Ziad E-commerce MVP.

Its purpose is to establish a strict boundary between:

- What must be built for MVP
- What may be built if required for MVP completion
- What is explicitly excluded from MVP

The MVP scope is binding for all implementation work.

AI coding agents must not implement excluded features unless explicitly approved.

---

# 2. MVP Objective

The MVP must prove that Ziad E-commerce can operate a complete basic ecommerce lifecycle for an Egyptian merchant.

The MVP must support:

```text
Merchant
↓
Create Store
↓
Create Catalog
↓
Manage Inventory
↓
Publish Storefront
↓
Customer Browses
↓
Customer Adds Product
↓
Checkout
↓
Payment
↓
Order Created / Confirmed
↓
Merchant Manages Order

The MVP is successful when this flow works reliably from end to end.

3. MVP Scope Principles

The MVP follows these principles:

Build the smallest useful ecommerce platform.
Prioritize reliability over feature count.
Prioritize secure multi-tenancy.
Avoid premature infrastructure complexity.
Avoid features that do not contribute to the core commerce lifecycle.
Build foundations that allow future expansion.
Do not implement future features just because the architecture supports them.
4. MVP Modules

The MVP consists of the following modules:

1. Authentication
2. Store Management
3. Merchant Dashboard
4. Product Management
5. Variant Management
6. Category Management
7. Inventory Management
8. Customer Management
9. Cart
10. Checkout
11. Orders
12. Payments
13. Storefront
14. Basic CMS
15. Media Management
16. Subscription / Trial
17. Notifications
18. Audit Logging
5. Authentication
IN SCOPE

Merchant authentication using Supabase Auth.

Required capabilities:

Register
Login
Logout
Session management
Password reset
Authenticated user session
Basic protected routes

Authentication must integrate with StoreMembership authorization.

6. Store Management
IN SCOPE

Merchant can:

Create Store
View Store
Edit Store
Configure basic Store settings
Upload Store logo
Configure Store status
View Store URL / slug

Initial Store information:

Store name
Store slug
Currency
Logo
Basic contact information

Default currency:

EGP
7. Merchant Dashboard
IN SCOPE

The merchant dashboard must provide a basic operational overview.

Initial information:

Total orders
Revenue
Product count
Inventory status
Recent orders

The dashboard does not require advanced analytics.

8. Product Management
IN SCOPE

Merchant can:

Create Product
Edit Product
View Product
Archive Product
Publish Product
Unpublish Product
Add Product description
Upload Product images
Assign Product to Category

Initial Product information:

Name
Description
Status
Images
Category
Variants
9. Product Variants
IN SCOPE

Products may contain variants.

Variant information:

Variant name/options
SKU
Price
Compare-at price
Image
Inventory

Example:

T-Shirt

Black / Small
Black / Medium
Black / Large
White / Small
White / Medium

Barcode is OUT OF SCOPE for MVP.

10. Category Management
IN SCOPE

Merchant can:

Create Category
Edit Category
Archive Category
View Category
Assign Products to Categories

Products may belong to multiple Categories if supported by the final domain model.

11. Inventory Management
IN SCOPE

Inventory is managed at ProductVariant level.

The system must maintain:

On Hand
Reserved
Available

Formula:

Available = On Hand - Reserved

Merchant can:

Set initial inventory
Adjust inventory
View inventory
View stock status

The system must prevent negative available inventory.

12. Inventory Reservation
IN SCOPE

The system must support temporary inventory reservation during checkout/payment flow.

Reservation must:

Have a quantity
Belong to a variant
Have an expiration
Be releasable
Be consumable after successful payment

The exact reservation timing must be defined in the Business Rules specification.

13. Customer Management
IN SCOPE

The platform must support:

Registered Customers

Customers may create accounts.

Guest Customers

Customers may complete checkout without creating an account.

Merchant can:

View customers
View customer details
View customer order history
14. Cart
IN SCOPE

Customer can:

Add ProductVariant to Cart
Update quantity
Remove ProductVariant
View Cart
Proceed to Checkout

Cart must be Store-specific.

Cart data must not be treated as authoritative for:

Price
Inventory
Order totals

All critical values must be revalidated during checkout.

15. Checkout
IN SCOPE

Checkout collects:

Customer Information
Name
Phone
Email where applicable
Shipping Information
Governorate
City
Address
Additional address details
Payment Method

Initial online payment provider:

Paymob
16. Checkout Validation

The backend must validate before creating the order:

Store is available
Product is published
Variant is available
Inventory is sufficient
Price is current
Quantity is valid
Shipping cost is valid
Order total is correct

Client-provided totals must never be trusted.

17. Orders
IN SCOPE

Merchant can:

View orders
View order details
Filter orders
Search orders
Update allowed order statuses

Customer receives an order confirmation.

Order must contain historical snapshots of purchased product information.

18. Order Statuses

Initial statuses:

PENDING
CONFIRMED
PROCESSING
SHIPPED
DELIVERED
CANCELLED

The exact transition rules are defined outside this document.

No arbitrary status changes should be allowed.

19. Payments
IN SCOPE

Initial payment provider:

Paymob

The system must support:

Create payment attempt
Initiate payment
Receive payment result
Verify payment callback/webhook
Process successful payment
Process failed payment
Prevent duplicate payment processing

The payment provider must not become the source of truth for the Order domain.

20. Payment Security

Payment callbacks/webhooks must:

Verify authenticity.
Persist provider event.
Deduplicate provider event.
Process event safely.
Update Payment state.
Apply required Order effects.
Support retry/reprocessing.

Browser redirects must not be treated as authoritative payment confirmation.

21. Storefront
IN SCOPE

Each active Store has a public storefront.

Required pages:

Home
Product Listing
Category
Product Details
Cart
Checkout
Order Confirmation
22. Storefront Features

Customers can:

Browse products
Browse categories
View product details
Select variants
View prices
View availability
Add products to cart
Checkout
Complete payment
Receive confirmation
23. Storefront SEO
IN SCOPE

Public storefront pages must support:

Server-side rendering / static generation where appropriate
Page metadata
Product metadata
SEO-friendly URLs
Search-engine-readable content
24. Basic CMS
IN SCOPE

The MVP provides basic CMS capabilities.

Merchant can manage:

Homepage
Pages
Navigation
Basic theme configuration
25. Homepage Sections

Initial section types:

Hero
Banner
Featured Products
Category Grid
Text
Image

Sections must be configuration-driven.

A complex visual page builder is OUT OF SCOPE.

26. Theme
IN SCOPE

Merchant can configure:

Logo
Primary colors
Typography
Basic layout configuration

The theme must be reusable and configuration-driven.

27. Media Management
IN SCOPE

Media management must support:

Product images
Store logo
CMS images

Storage provider:

Supabase Storage

Media must be Store-scoped.

28. Search
IN SCOPE

MVP search is intentionally simple.

Initial search capability:

Product Name

PostgreSQL search is sufficient.

No dedicated search engine is required.

29. Notifications
IN SCOPE

Initial notifications:

Order confirmation
Basic transactional email

Email is the first notification channel.

30. Subscription / Trial
IN SCOPE

The platform must support:

Trial
Active Subscription
Expired Subscription

Subscription is Store-scoped.

The exact pricing and payment model for SaaS billing may be finalized separately.

31. Expired Subscription

When a Store subscription expires:

Merchant Dashboard
→ Read Only

Public Storefront
→ Disabled

Merchant data must remain stored.

No automatic deletion of commerce data is allowed.

32. Multi-Tenancy
IN SCOPE

The MVP is multi-tenant.

Tenant boundary:

Store

Every Store-owned entity must be isolated.

Tenant isolation must be enforced through:

Application authorization
Store membership
PostgreSQL Row-Level Security

Application filtering alone is not sufficient.

33. Authorization
IN SCOPE

Authorization must use:

User
+
StoreMembership
+
Role
+
Permission

The MVP must support at least the concept of Store Owner/Admin access.

A more advanced role system may be introduced if required.

34. Audit Logging
IN SCOPE

Important administrative operations must be auditable.

Examples:

Product creation
Product update
Inventory adjustment
Order status change
Store configuration change
Permission changes
35. External Integrations
MVP IN SCOPE
Supabase Auth
Supabase Storage
Paymob
Email Provider
36. External Integrations — OUT OF MVP

The following are explicitly excluded:

Meta Catalog
Facebook Commerce
Instagram Commerce
WhatsApp Business
Fawry
Multiple Payment Gateways
Shipping Provider Integrations
Google Shopping
TikTok Shop

These may be implemented after MVP.

37. Egypt Compliance

The platform architecture must be capable of supporting Egypt-specific tax/e-invoicing requirements.

However:

Full ETA e-invoicing/e-receipt integration

is NOT considered part of the initial technical MVP unless explicitly approved as a launch requirement.

The Order and Payment domains must be designed so that compliance functionality can be added later without restructuring the core commerce model.

38. Out of Scope — Commerce Features

The following are explicitly OUT OF MVP:

Discount Engine
Coupons
Gift Cards
Loyalty
Product Reviews
Wishlists
Bundles
Subscriptions for Products
Pre-orders
Backorders
Returns Management
Refund Automation
Advanced Promotions

Basic manual order/payment handling may be supported where required.

39. Out of Scope — Inventory Features
Multiple Warehouses
Multiple Inventory Locations
Purchase Orders
Suppliers
Stock Transfers
Advanced Inventory Forecasting
Barcode Scanning
40. Out of Scope — Shipping

The MVP does not include a full shipping management platform.

Excluded:

Shipping Provider API Integrations
Courier Tracking
Automatic Shipping Label Generation
Route Optimization
Warehouse Fulfillment

Basic shipping information may still be collected during checkout.

41. Out of Scope — Marketing
Email Marketing Automation
SMS Marketing Campaigns
WhatsApp Marketing
Abandoned Cart Automation
Customer Segmentation
Marketing Automation
Affiliate System
Referral System
42. Out of Scope — Analytics

Advanced analytics are excluded.

Excluded:

Advanced Sales Analytics
Cohort Analysis
Customer Lifetime Value
Marketing Attribution
Advanced Reports
Custom Report Builder
Real-time BI

Basic operational dashboard information remains IN SCOPE.

43. Out of Scope — Advanced Search
Typo Tolerance
Search Ranking
Faceted Search
Advanced Filters
Synonyms
Semantic Search
AI Search
44. Out of Scope — AI Features

No AI-specific product feature is required for MVP.

Excluded:

AI Product Descriptions
AI Recommendations
AI Search
AI Customer Support
AI Sales Assistant
AI Marketing
AI Pricing

AI may be used internally as a development tool.

45. Out of Scope — Platform Architecture

The MVP will NOT introduce:

Microservices
Kubernetes
Service Mesh
Database Sharding
Multi-Region Infrastructure
Kafka
Complex Event Streaming
Dedicated Search Cluster
Dedicated Analytics Warehouse

The architecture must remain a modular monolith.

46. MVP Technology Scope

Initial technology direction:

Frontend
Next.js
React
TypeScript

Backend
NestJS
TypeScript

Database
PostgreSQL

Platform Services
Supabase Auth
Supabase Storage

Deployment
Vercel
+
Railway / Render

Payment
Paymob

The technology stack may only be changed through an explicit architecture decision.

47. MVP Non-Functional Requirements

The MVP must provide:

Security
Tenant isolation
Authentication
Authorization
RLS
Webhook verification
Secure secrets
Reliability
Idempotent critical operations
Safe payment processing
Safe inventory operations
Transactional order creation
Error handling
Performance

The system should provide acceptable performance for an early-stage SaaS without premature infrastructure optimization.

Maintainability

The codebase must follow modular architecture and clear domain boundaries.

48. MVP End-to-End Acceptance Flow

The MVP is considered functionally complete when the following scenario works:

Merchant registers
↓
Creates Store
↓
Creates Category
↓
Creates Product
↓
Creates Variant
↓
Sets Inventory
↓
Publishes Product
↓
Customer opens Storefront
↓
Customer views Product
↓
Customer selects Variant
↓
Customer adds Product to Cart
↓
Customer starts Checkout
↓
Backend validates Product + Price + Inventory
↓
Inventory is Reserved
↓
Order is Created
↓
Payment is Initiated
↓
Paymob processes Payment
↓
Verified Payment Event is Received
↓
Payment is Confirmed
↓
Order is Confirmed
↓
Inventory Reservation is Consumed
↓
Merchant sees Order
↓
Customer receives Confirmation
49. MVP Definition of Done

The MVP is complete only when:

All MVP modules are implemented.
Critical user journeys work.
Tenant isolation is tested.
Authorization is tested.
Inventory concurrency is tested.
Order idempotency is tested.
Payment webhook idempotency is tested.
Error states are handled.
Storefront works on mobile and desktop.
Basic SEO works.
Database migrations are reproducible.
Seed/demo data exists.
Automated tests cover critical business logic.
Production deployment is repeatable.
No critical security issue remains open.
50. Scope Change Policy

Any feature not explicitly included in this document is considered OUT OF MVP by default.

If a new feature is requested, the following process must be followed:

Feature Request
↓
Evaluate Business Value
↓
Evaluate Technical Impact
↓
Evaluate MVP Risk
↓
Approve / Reject
↓
Update MVP-SCOPE.md
↓
Update PRD if required
↓
Update Domain Model if required
↓
Update Architecture if required
↓
Implement

AI coding agents must not silently expand MVP scope.

51. AI Agent Scope Rule

Before implementing any feature, the AI agent must determine:

Is this feature explicitly inside MVP scope?
Does the PRD define the required behavior?
Does the Domain Model support it?
Does the Architecture support it?
Are business rules defined?

If the answer is NO or ambiguous:

STOP IMPLEMENTATION
↓
Explain the ambiguity
↓
Identify affected documents
↓
Ask for approval

The agent must not invent product decisions.

52. MVP Philosophy

The MVP is not intended to compete feature-for-feature with Shopify.

The MVP exists to prove:

Reliable Store Creation
+
Reliable Catalog Management
+
Reliable Inventory
+
Reliable Checkout
+
Reliable Payment
+
Reliable Orders
+
Secure Multi-Tenancy

Everything else is secondary.

53. Future Expansion

After MVP validation, potential expansion areas include:

Meta Commerce
Facebook / Instagram
WhatsApp
Shipping Integrations
Multiple Payment Providers
ETA Compliance
Discounts
Coupons
Advanced Analytics
Advanced Search
Multi-location Inventory
Marketing
AI Commerce
B2B
Marketplace
App Ecosystem

Future features must be added incrementally based on real merchant needs and measured product demand.