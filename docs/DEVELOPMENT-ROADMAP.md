# Ziad E-commerce — Development Roadmap

**Version:** 1.0  
**Status:** Approved  
**Owner:** Ziad  
**Technical Lead:** CTO / AI-assisted development

---

# 1. Purpose

This document defines the implementation roadmap for Ziad E-commerce.

The roadmap converts the approved BRD, PRD, MVP Scope, Architecture, Domain Model, API Specification, and User Stories into an ordered development sequence.

AI coding agents must follow this roadmap.

The agent must NOT jump randomly between modules.

---

# 2. Development Strategy

The project will be developed incrementally.

Each phase must produce a working and testable result.

The implementation strategy is:

```text
Foundation
    ↓
Authentication
    ↓
Multi-Tenancy
    ↓
Store Management
    ↓
Catalog
    ↓
Inventory
    ↓
Customers
    ↓
Cart
    ↓
Checkout
    ↓
Orders
    ↓
Payments
    ↓
Storefront
    ↓
CMS
    ↓
Subscriptions
    ↓
Integrations
    ↓
Analytics
    ↓
Hardening
3. Phase 0 — Project Foundation
Goal

Create the technical foundation of the project.

Tasks
Initialize repository structure.
Initialize frontend.
Initialize backend.
Configure TypeScript.
Configure environment variables.
Configure linting.
Configure formatting.
Configure testing.
Configure database connection.
Configure Supabase.
Create .env.example.
Create basic CI validation.
Create development documentation.
Expected Result

The project must:

Start locally.
Build successfully.
Run lint successfully.
Run type checking successfully.
Run tests successfully.
Connect to the development database.
4. Phase 1 — Authentication
Goal

Implement secure user authentication.

Features
Registration
Login
Logout
Session handling
Password reset
Email verification where applicable
Current-user endpoint
Protected routes
Security

Verify:

Authentication
Session validation
Unauthorized access
Invalid sessions
Expected Result

A user can securely create an account, log in, log out, and access protected areas.

5. Phase 2 — Multi-Tenancy & Store
Goal

Establish the Store/Tenant foundation.

Features
Create Store
Store settings
Store name
Store slug
Store status
Store branding configuration
Store ownership
Store membership
Security

Implement:

store_id
Store membership validation
Role-based authorization
PostgreSQL RLS
Required Tests

Verify:

Store A cannot access Store B.

Test:

Read
Create
Update
Delete
Expected Result

Users can securely operate inside their own Store.

6. Phase 3 — Users & Roles
Goal

Implement store-level access control.

Features
Store members
Roles
Permissions
Owner
Admin
Staff
Requirements

Authorization must be enforced server-side.

Frontend visibility alone is NOT authorization.

Expected Result

Users can only perform operations allowed by their Store role.

7. Phase 4 — Catalog
Goal

Build the core product catalog.

Features
Products
Create product
Update product
Delete product
Product status
Product title
Description
Product media
Categories
Create category
Update category
Delete category
Assign products to categories
Variants
Create variant
Update variant
Delete variant
SKU
Price
Compare-at price where applicable
Variant attributes
Security

All catalog operations must be tenant-isolated.

Expected Result

Merchant can completely manage the product catalog.

8. Phase 5 — Inventory
Goal

Implement reliable inventory management.

Features
Inventory quantity
Available quantity
Reserved quantity
Inventory adjustment
Stock status
Out-of-stock state
Rules
available_quantity =
on_hand_quantity - reserved_quantity

Inventory updates must be transaction-safe.

Required Tests

Test:

Normal decrement
Concurrent decrement
Insufficient inventory
Cancellation
Reservation expiration
Expected Result

The system must prevent overselling.

9. Phase 6 — Customers
Goal

Implement customer management.

Features
Customer creation
Customer profile
Customer addresses
Customer order history
Customer search
Customer status
Security

Customers must belong to the correct Store.

Expected Result

Merchants can manage customers and view their order history.

10. Phase 7 — Cart
Goal

Implement shopping cart functionality.

Features
Add item
Remove item
Update quantity
Clear cart
Cart persistence
Cart validation
Rules

The backend must revalidate:

Product existence
Variant existence
Product availability
Current price
Inventory

Never trust frontend cart totals.

Expected Result

Customers can maintain a valid shopping cart.

11. Phase 8 — Checkout
Goal

Implement secure checkout.

Flow
Cart
 ↓
Checkout
 ↓
Validate Customer
 ↓
Validate Products
 ↓
Validate Inventory
 ↓
Calculate Prices
 ↓
Calculate Totals
 ↓
Reserve Inventory
 ↓
Create Pending Order
 ↓
Initiate Payment
Requirements
Idempotency
Inventory validation
Price recalculation
Customer information
Address
Shipping information
Order creation
Expected Result

Checkout produces a valid pending order without duplicate orders.

12. Phase 9 — Orders
Goal

Build the order management system.

Features
Create order
View order
Order details
Order items
Order status
Payment status
Fulfillment status
Cancel order
Order history
Order Status

Initial state machine:

PENDING
   ↓
CONFIRMED
   ↓
PROCESSING
   ↓
SHIPPED
   ↓
DELIVERED

Cancellation must only be allowed from valid states.

Expected Result

Merchant can manage the complete order lifecycle.

13. Phase 10 — Payments
Goal

Integrate Paymob.

Features
Payment initiation
Payment reference
Payment status
Payment callback/webhook
Payment verification
Failed payment handling
Successful payment handling
Security

Never trust client-side payment status.

Payment status must be verified through the payment provider.

Webhook Flow
Webhook
 ↓
Verify Signature
 ↓
Check Event ID
 ↓
Check Duplicate
 ↓
Persist Event
 ↓
Process Payment
 ↓
Update Order
 ↓
Update Inventory
Expected Result

Successful payments reliably confirm orders.

14. Phase 11 — Storefront
Goal

Build the customer-facing online store.

Features
Store homepage
Product listing
Product details
Categories
Search
Cart
Checkout
Order confirmation
Requirements
Responsive
SEO-friendly
Fast
Accessible
Expected Result

Each Store has a functional public storefront.

15. Phase 12 — CMS
Goal

Allow merchants to control storefront presentation.

Features
Pages
Sections
Hero sections
Banners
Text blocks
Images
Navigation
Theme settings
Store branding
Rules

CMS must control presentation.

CMS must NOT directly modify:

Orders
Payments
Inventory
Expected Result

Merchants can customize their storefront without developer intervention.

16. Phase 13 — Media
Goal

Implement centralized media management.

Features
Upload image
Delete image
Product media
CMS media
Media metadata
Storage organization
Storage Structure
{store_id}/
    products/
    categories/
    cms/
    branding/
Security

Store A must never access Store B media.

17. Phase 14 — SaaS Subscription
Goal

Implement SaaS subscription management.

Features
Free trial
Subscription plans
Monthly subscription
Annual subscription
Subscription status
Trial expiration
Subscription expiration
Read-only mode
Storefront closure
Expiration Behavior

When subscription expires:

Admin
  ↓
Read-only

Storefront
  ↓
Closed

Existing merchant data must NOT be deleted.

18. Phase 15 — Notifications
Goal

Implement transactional notifications.

Initial channels
Email
Future
WhatsApp
SMS
Events

Examples:

Order Created
Payment Confirmed
Payment Failed
Order Shipped
Order Delivered
Subscription Expiring
Subscription Expired

Notifications should consume domain events rather than tightly coupling notification logic to business modules.

19. Phase 16 — Meta Integration
Goal

Synchronize Store catalog with Meta.

Features
Connect Meta Business account
Connect catalog
Product synchronization
Inventory synchronization
Sync status
Error handling
Retry mechanism
Architecture
Merchant
   ↓
Ziad E-commerce
   ↓
Queue / Background Job
   ↓
Meta API

Merchant actions must NOT wait for Meta API operations synchronously.

20. Phase 17 — Analytics
Goal

Provide basic merchant analytics.

MVP Analytics
Total orders
Total sales
Number of customers
Number of products
Best-selling products
Orders by status
Sales over time

Analytics may be eventually consistent.

Analytics must not block core commerce operations.

21. Phase 18 — Security Hardening

Before MVP release, perform a dedicated security pass.

Check
Authentication
Unauthorized access
Session validation
Authorization
Role enforcement
Store ownership
Multi-Tenancy
Cross-store reads
Cross-store writes
Cross-store deletes
API
Input validation
Rate limiting
Error handling
Payments
Webhook signature validation
Duplicate webhook handling
Idempotency
Database
RLS policies
Foreign keys
Constraints
Indexes
Secrets
No credentials in Git
.env excluded
Production secrets secured
22. Phase 19 — Performance & Reliability

Only after functionality is stable.

Evaluate:

Database indexes
Query performance
API latency
Storefront performance
Image optimization
Caching
Background jobs

Do NOT introduce infrastructure without measured need.

23. Phase 20 — MVP Release

Before release:

All MVP Stories
       ↓
Implemented
       ↓
Unit Tests
       ↓
Integration Tests
       ↓
E2E Tests
       ↓
Security Review
       ↓
Performance Review
       ↓
Production Configuration
       ↓
Deployment
       ↓
Smoke Tests
       ↓
MVP RELEASE
24. MVP Release Criteria

The MVP is NOT considered complete unless:

Authentication works.
Store creation works.
Tenant isolation works.
RLS policies work.
Product management works.
Variant management works.
Inventory works.
Customer management works.
Cart works.
Checkout works.
Orders work.
Payment integration works.
Storefront works.
CMS works.
Subscription enforcement works.
Critical tests pass.
Production build passes.
Security review passes.
25. Post-MVP

The following are explicitly postponed:

Redis
BullMQ
Meilisearch
Advanced analytics
WhatsApp
SMS
Advanced Meta commerce features
Multi-location inventory
Multi-currency
Multi-region
Microservices
Database sharding
Kubernetes

These features may be introduced based on real requirements.

26. AI Agent Execution Rule

AI agents must execute the roadmap sequentially.

The agent must not start Phase N+1 if Phase N has unresolved critical defects.

Each phase must produce:

Code
+
Tests
+
Documentation
+
Validation
+
Git Commit
27. Phase Completion Report

At the end of each phase, the AI agent must report:

Phase:
Status:

Completed:
- ...

Files Changed:
- ...

Database Changes:
- ...

API Changes:
- ...

Tests:
- ...

Security:
- ...

Lint:
PASS / FAIL

Typecheck:
PASS / FAIL

Build:
PASS / FAIL

Known Issues:
- ...

Commit:
<commit hash>
28. Development Philosophy

The project follows:

Simple
    ↓
Correct
    ↓
Secure
    ↓
Tested
    ↓
Observable
    ↓
Optimized
    ↓
Scaled

Not:

Complex
    ↓
Over-engineered
    ↓
Slow to build
    ↓
Hard to maintain
29. CTO Rule

The objective is not to build Shopify immediately.

The objective is to build a reliable foundation that can eventually become Shopify-like.

Therefore:

Build today's requirements with tomorrow's boundaries, not tomorrow's infrastructure.

30. Current Development Phase

Current phase:

PHASE 0 — PROJECT FOUNDATION