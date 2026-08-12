# Ziad E-commerce — API Specification

**Version:** 1.0  
**Status:** Draft  
**Owner:** Ziad  
**Technical Lead:** CTO / AI-assisted development

---

# 1. Purpose

This document defines the initial API contract for the Ziad E-commerce SaaS platform.

The API is the communication contract between:

- Next.js Admin Dashboard
- Next.js Storefront
- NestJS Backend
- External integrations

The API must follow the architecture, MVP scope, product requirements, and domain model defined in the project documentation.

AI coding agents must not create undocumented public endpoints without approval.

---

# 2. API Architecture

The backend uses:

```text
NestJS
REST API
TypeScript

Base URL:

/api/v1

Example:

GET /api/v1/products
3. API Design Principles

The API must follow these principles:

RESTful resource-oriented design.
Consistent request/response structures.
Explicit validation.
Authentication where required.
Store-level authorization.
Tenant isolation.
Idempotency for critical write operations.
Predictable error responses.
Pagination for collection endpoints.
No business logic in controllers.

Controllers should coordinate requests.

Business logic belongs inside application/domain services.

4. Authentication

Authentication is handled by:

Supabase Auth

The frontend obtains the authenticated session/token.

The API validates the authenticated user.

Example:

Authorization: Bearer <access_token>

Unauthenticated requests to protected endpoints must return:

401 Unauthorized
5. Tenant Context

The primary tenant boundary is:

Store

Every protected merchant request must resolve:

Authenticated User
        ↓
Store Membership
        ↓
Store

The client must not be trusted to determine tenant ownership.

The backend must validate that the authenticated user has access to the requested Store.

6. Authorization

Authorization is based on:

User
+
StoreMembership
+
Role
+
Permission

At minimum, MVP supports merchant Store Owner/Admin access.

Authorization must be checked server-side.

Frontend route protection is not sufficient.

7. API Response Convention

Successful single-resource response:

{
  "data": {
    "id": "..."
  }
}

Successful collection response:

{
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 0
  }
}
8. Error Response Convention

All API errors should follow a consistent structure:

{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "The requested resource was not found.",
    "details": {}
  }
}

Example validation error:

{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "details": {
      "name": [
        "Name is required."
      ]
    }
  }
}

The API must not expose:

Stack traces
Database credentials
Internal secrets
Sensitive infrastructure information
9. HTTP Status Codes

Initial conventions:

200 OK
201 Created
204 No Content

400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity
429 Too Many Requests

500 Internal Server Error
502 Bad Gateway
503 Service Unavailable
10. Pagination

Collection endpoints support:

?page=1&limit=20

Defaults:

page = 1
limit = 20

Maximum limit:

100

The backend must enforce the maximum.

11. Filtering

Collection endpoints may support resource-specific filters.

Example:

GET /api/v1/products?status=published

Filters must be explicitly documented per endpoint.

The backend must not dynamically expose arbitrary database columns as filters.

12. Sorting

Supported sorting must be explicitly defined per endpoint.

Example:

GET /api/v1/products?sort=createdAt&order=desc

Only approved sortable fields may be accepted.

13. Idempotency

Critical operations must support idempotency.

Header:

Idempotency-Key: <unique-key>

Required for applicable operations such as:

Order creation
Payment initiation
Payment processing
Inventory reservation
Webhook processing

The backend must return the original result when the same valid idempotency key is replayed.

14. API Modules

Initial API modules:

auth
stores
products
variants
categories
inventory
customers
cart
checkout
orders
payments
cms
media
subscriptions
notifications
audit
webhooks
15. Store API
Create Store
POST /api/v1/stores

Request:

{
  "name": "My Store",
  "slug": "my-store",
  "currency": "EGP"
}

Response:

201 Created
Get Current Store
GET /api/v1/stores/current

Returns the Store associated with the authenticated merchant context.

Update Store
PATCH /api/v1/stores/current

Possible fields:

{
  "name": "Updated Store",
  "logoMediaId": "...",
  "contactEmail": "...",
  "contactPhone": "..."
}
16. Product API
List Products
GET /api/v1/products

Supported query parameters:

page
limit
search
status
categoryId
sort
order
Get Product
GET /api/v1/products/:productId
Create Product
POST /api/v1/products

Example:

{
  "name": "Classic T-Shirt",
  "description": "Classic cotton T-shirt",
  "status": "DRAFT"
}
Update Product
PATCH /api/v1/products/:productId
Publish Product
POST /api/v1/products/:productId/publish
Unpublish Product
POST /api/v1/products/:productId/unpublish
Archive Product
POST /api/v1/products/:productId/archive
17. Variant API
List Product Variants
GET /api/v1/products/:productId/variants
Create Variant
POST /api/v1/products/:productId/variants

Example:

{
  "name": "Black / Medium",
  "sku": "TS-BLK-M",
  "price": 500,
  "compareAtPrice": 600
}
Update Variant
PATCH /api/v1/variants/:variantId
Archive Variant
POST /api/v1/variants/:variantId/archive
18. Category API
List Categories
GET /api/v1/categories
Create Category
POST /api/v1/categories

Example:

{
  "name": "T-Shirts",
  "description": "T-Shirts collection"
}
Get Category
GET /api/v1/categories/:categoryId
Update Category
PATCH /api/v1/categories/:categoryId
Archive Category
POST /api/v1/categories/:categoryId/archive
Assign Product to Category
POST /api/v1/products/:productId/categories/:categoryId
Remove Product from Category
DELETE /api/v1/products/:productId/categories/:categoryId
19. Inventory API
Get Variant Inventory
GET /api/v1/variants/:variantId/inventory
Adjust Inventory
POST /api/v1/variants/:variantId/inventory/adjust

Example:

{
  "quantity": 10,
  "reason": "INITIAL_STOCK"
}
Get Inventory Movements
GET /api/v1/variants/:variantId/inventory/movements
20. Customer API
List Customers
GET /api/v1/customers

Query:

page
limit
search
Get Customer
GET /api/v1/customers/:customerId
Get Customer Orders
GET /api/v1/customers/:customerId/orders

Customer creation may occur automatically during checkout.

Merchant-side manual Customer creation is not required unless explicitly added to MVP requirements.

21. Cart API

Cart is a Storefront operation.

Get Cart
GET /api/v1/cart

The cart is resolved from the current customer/session context.

Add Cart Item
POST /api/v1/cart/items

Request:

{
  "variantId": "...",
  "quantity": 2
}
Update Cart Item
PATCH /api/v1/cart/items/:itemId

Request:

{
  "quantity": 3
}
Remove Cart Item
DELETE /api/v1/cart/items/:itemId
Clear Cart
DELETE /api/v1/cart/items
22. Checkout API

Checkout is a critical transaction boundary.

Create Checkout
POST /api/v1/checkout

Example:

{
  "customer": {
    "name": "Ahmed Ali",
    "phone": "01000000000",
    "email": "ahmed@example.com"
  },
  "shippingAddress": {
    "governorate": "Gharbia",
    "city": "Tanta",
    "addressLine": "..."
  }
}

The backend must:

Load the Cart.
Validate Store.
Validate Products.
Validate Variants.
Validate prices.
Validate inventory.
Calculate totals server-side.
Reserve inventory where applicable.
Create Order.
Create Payment Attempt if required.
Return the checkout/payment result.

Client-provided totals must never be trusted.

23. Order API
List Orders
GET /api/v1/orders

Supported filters:

page
limit
status
search
dateFrom
dateTo
Get Order
GET /api/v1/orders/:orderId
Update Order Status
PATCH /api/v1/orders/:orderId/status

Example:

{
  "status": "PROCESSING"
}

The backend must validate the status transition.

24. Payment API
Create Payment Attempt
POST /api/v1/orders/:orderId/payments

Requires:

Idempotency-Key
Get Payment
GET /api/v1/orders/:orderId/payment
Payment Webhook

Provider-specific webhook:

POST /api/v1/webhooks/paymob

Webhook processing must:

Verify authenticity.
Persist the provider event.
Check event idempotency.
Process payment state.
Update Order state where appropriate.
Update inventory reservation where appropriate.
Return a safe response.

Webhook processing must not depend on the browser redirect.

25. CMS API
Pages
List Pages
GET /api/v1/pages
Create Page
POST /api/v1/pages
Get Page
GET /api/v1/pages/:pageId
Update Page
PATCH /api/v1/pages/:pageId
Delete/Archive Page
POST /api/v1/pages/:pageId/archive
26. Page Sections
Add Section
POST /api/v1/pages/:pageId/sections

Example:

{
  "type": "HERO",
  "position": 0,
  "content": {}
}
Update Section
PATCH /api/v1/pages/:pageId/sections/:sectionId
Delete Section
DELETE /api/v1/pages/:pageId/sections/:sectionId
Reorder Sections
POST /api/v1/pages/:pageId/sections/reorder

Example:

{
  "sectionIds": [
    "section-1",
    "section-3",
    "section-2"
  ]
}
27. Navigation API
Get Navigation
GET /api/v1/navigation
Update Navigation
PUT /api/v1/navigation

Navigation may reference:

Pages
Categories
Storefront destinations
28. Theme API
Get Theme Configuration
GET /api/v1/theme
Update Theme Configuration
PUT /api/v1/theme

Example:

{
  "primaryColor": "#000000",
  "fontFamily": "Inter"
}
29. Media API
Create Media Upload
POST /api/v1/media

The backend should return the required upload information/reference.

Binary media should be stored in:

Supabase Storage
Get Media
GET /api/v1/media/:mediaId
Delete Media
DELETE /api/v1/media/:mediaId
30. Subscription API
Get Current Subscription
GET /api/v1/subscription
Subscription Status

The API must expose sufficient information for the frontend to determine:

TRIAL
ACTIVE
EXPIRED

The backend remains authoritative for access control.

The frontend must never be trusted to enforce subscription restrictions.

31. Storefront API

Public Storefront endpoints must be separated conceptually from merchant/admin endpoints.

Possible public endpoints:

GET /api/v1/storefront
GET /api/v1/storefront/products
GET /api/v1/storefront/products/:slug
GET /api/v1/storefront/categories
GET /api/v1/storefront/categories/:slug
GET /api/v1/storefront/pages/:slug

Storefront requests must resolve the Store from the storefront domain/subdomain.

32. Storefront Product Response

Public product responses should expose only required public fields.

Example:

{
  "data": {
    "id": "...",
    "name": "Classic T-Shirt",
    "slug": "classic-t-shirt",
    "description": "...",
    "images": [],
    "variants": [
      {
        "id": "...",
        "name": "Black / Medium",
        "price": 500,
        "available": true
      }
    ]
  }
}

Internal fields must never leak to the public Storefront API.

33. API Security Rules

Every protected endpoint must validate:

Authentication
↓
Store Access
↓
Authorization
↓
Input Validation
↓
Business Rules
↓
Database Operation

Never trust:

Store ID supplied by client
User ID supplied by client
Price supplied by client
Inventory supplied by client
Payment status supplied by client
Order total supplied by client
34. Tenant Isolation Rules

Every Store-owned resource must be scoped to the authenticated Store context.

Examples:

Product
Variant
Category
Inventory
Customer
Cart
Order
Page
Media
Subscription
AuditLog

A user must never be able to access another Store's resource by changing an ID in the URL.

Example attack:

GET /api/v1/orders/store-B-order-id

must return:

404 Not Found

or an appropriate authorization-safe response.

35. Resource Ownership Validation

The backend must validate ownership through database relationships.

Example:

Order
↓
Store
↓
Current User Membership

The backend must not assume that possessing an orderId grants access.

36. Public vs Protected APIs

Public:

Storefront catalog
Storefront categories
Public pages
Public store configuration required for rendering
Cart operations where guest sessions are supported
Checkout initiation
Payment redirect/result endpoints where required

Protected:

Store management
Product management
Inventory management
Customer management
Order management
CMS management
Media management
Subscription management
Audit logs
37. API Rate Limiting

Rate limiting must be applied to sensitive endpoints.

Especially:

Authentication
Checkout
Payment creation
Webhooks
Public search
Public product APIs

Exact limits will be configured during implementation and deployment based on measured requirements.

38. Database Transactions

The following operations must use appropriate database transactions:

Checkout
Order creation
Inventory reservation
Inventory consumption
Inventory release
Payment state transition
Critical inventory adjustment

Transactions must be kept as short as reasonably possible.

External API calls should not unnecessarily remain inside database transactions.

39. External API Calls

External providers such as Paymob must not be called blindly from synchronous critical paths when asynchronous processing is more appropriate.

External calls must support:

Timeout
Retry where safe
Idempotency where supported
Structured logging
Failure handling

The exact queue/background-job strategy is defined in the implementation architecture.

40. API Logging

The backend must log relevant operational information without logging sensitive secrets.

Logs may contain:

Request ID
User ID
Store ID
Endpoint
HTTP method
Status code
Execution duration
Error code
External provider reference

Never log:

Passwords
Access tokens
API secrets
Payment secrets
Full sensitive payment credentials
41. Request Correlation

The API should support a request/correlation ID.

Example:

X-Request-ID

If provided by the client or edge layer, the backend should propagate it through relevant logs.

42. API Versioning

Initial API version:

v1

All public endpoints should use:

/api/v1/...

Breaking API changes require a new API version or an approved migration strategy.

43. API Documentation

The NestJS backend should expose generated API documentation using OpenAPI/Swagger in development environments.

The API documentation must reflect the actual implemented contracts.

Generated documentation must not be treated as a substitute for this specification.

44. API Testing Requirements

Critical API behavior must have automated tests.

At minimum:

Authentication
Unauthorized request rejected
Authorized request accepted
Tenant Isolation
Store A cannot access Store B data
Products
Create
Update
Publish
Archive
Inventory
Adjustment
Insufficient stock
Concurrent reservation
Orders
Successful order creation
Invalid product
Invalid price
Insufficient inventory
Duplicate idempotency key
Payments
Successful payment
Failed payment
Duplicate webhook
Invalid webhook
CMS
Store isolation
CRUD operations
45. API Contract Rules for AI Agents

AI coding agents must:

Read this document before creating endpoints.
Follow /api/v1.
Reuse existing endpoints where possible.
Avoid duplicate endpoints.
Use DTO validation.
Respect authentication and authorization.
Respect Store tenant boundaries.
Never trust client-provided prices or totals.
Never trust client-provided Store ownership.
Implement idempotency for required operations.
Use transactions for critical commerce operations.
Never expose internal database structures unnecessarily.
Keep controllers thin.
Put business logic in services/use cases.
Add tests for critical endpoint behavior.
Update this document if an approved API contract changes.
46. API Open Decisions

The following must be finalized before production implementation:

Exact authentication/session strategy between Next.js and NestJS.
Exact Store resolution strategy for merchant APIs.
Exact Store resolution strategy for public storefront APIs.
Exact role/permission matrix.
Exact pagination implementation.
Exact API filtering conventions.
Exact checkout response contract.
Exact Paymob integration contract.
Exact webhook verification mechanism.
Exact API rate limits.
Exact background job strategy.
Exact public Storefront domain/subdomain strategy.

These decisions must be resolved before the related implementation begins.

47. Definition of Done

The API specification is considered implementation-ready when:

All MVP modules have API contracts.
Authentication requirements are defined.
Tenant isolation requirements are defined.
Authorization requirements are defined.
Critical write operations have idempotency requirements.
Error format is defined.
Pagination is defined.
Public and protected APIs are separated.
Webhook behavior is defined.
Critical API tests are identified.
Open decisions are resolved.