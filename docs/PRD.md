# Ziad E-commerce — Product Requirements Document

**Version:** 1.0  
**Status:** Draft  
**Product:** Ziad E-commerce  
**Market:** Egypt  
**Target:** Small Egyptian Merchants  
**Business Model:** Free Trial → Paid Subscription

---

# 1. Product Overview

Ziad E-commerce is a SaaS platform that allows small Egyptian merchants to create and operate an online store.

The platform provides two primary experiences:

1. Merchant/Admin Experience
2. Customer Storefront Experience

The merchant uses the Admin Dashboard to manage the business.

The customer uses the public Storefront to browse and purchase products.

---

# 2. Product Architecture

The product consists of the following major areas:

```text
Merchant
   |
   v
Admin Dashboard
   |
   +-- Store
   +-- Products
   +-- Categories
   +-- Inventory
   +-- Customers
   +-- Orders
   +-- CMS
   +-- Settings
   +-- Billing
          |
          v
      Storefront
          |
          v
       Customer
3. User Roles
3.1 Owner

The Owner has full access to the store.

Can:

Manage store
Manage products
Manage inventory
Manage customers
Manage orders
Manage CMS
Manage settings
Manage subscription
3.2 Admin

Admin can manage most store operations.

The exact permission matrix will be implemented through role-based authorization.

3.3 Staff

Staff has limited operational access.

Potential access:

Products
Inventory
Orders
Customers

Staff cannot manage:

Subscription
Store ownership
Critical account settings

unless explicitly permitted.

3.4 Customer

Customers interact with the public storefront.

They can:

Browse products
Add products to cart
Checkout
Pay
View order confirmation
4. Merchant Onboarding
Goal

Allow a new merchant to create a store and reach a usable dashboard quickly.

Flow
Register
   ↓
Verify Account
   ↓
Create Store
   ↓
Store Setup
   ↓
Dashboard
5. Registration

Merchant enters:

First name
Last name
Email
Password
Phone where applicable

The system creates the authentication identity through Supabase Auth.

After successful registration, the merchant can create a store.

6. Store Creation

Merchant provides:

Store name
Store slug
Store description
Currency
Timezone

Default currency:

EGP

Default timezone:

Africa/Cairo

The system creates the Store and associates it with the merchant.

The merchant becomes the Store Owner.

7. Admin Dashboard

The dashboard provides a high-level overview of store activity.

MVP dashboard may display:

Total orders
Pending orders
Revenue
Products
Low-stock products
Recent orders

Advanced analytics are outside MVP.

8. Product Management
Product List

Merchant can:

View products
Search products
Filter products
Create product
Edit product
Archive product
Publish product

Product list should display:

Product name
Status
Price
Inventory status
Number of variants
9. Create Product

Merchant enters:

Product name
Description
Images
Category
Variants
Pricing
Inventory

Product can initially be saved as Draft.

A draft product is not visible to customers.

10. Product Variants

Variants represent individual sellable versions.

Example:

T-Shirt
|
+-- Black / S
+-- Black / M
+-- Black / L
+-- White / S
+-- White / M
+-- White / L

Each variant can have:

Name
SKU
Price
Compare-at price
Cost price
Inventory
11. Product Publishing

A merchant can publish a product when required product information is valid.

Published products become available on the storefront.

Archived products are not available for normal purchase.

12. Categories

Merchant can:

Create category
Edit category
Archive category
Assign products
Remove products

Categories support parent/child relationships.

13. Inventory Management

Inventory is managed per variant.

Merchant can:

View stock
Add stock
Remove stock
Adjust stock
View inventory history

The system displays:

On hand
Reserved
Available

Formula:

Available = On Hand - Reserved
14. Low Stock

The MVP may provide basic low-stock visibility.

A merchant can configure a low-stock threshold.

Products below the threshold are marked as low stock.

Advanced inventory forecasting is outside MVP.

15. Storefront

Every active store has a public storefront.

The storefront contains:

Home
Product listing
Product details
Category pages
Cart
Checkout
Order confirmation
Basic CMS pages
16. Storefront URL

The initial MVP may use a platform-controlled store URL.

Example:

store-name.platform-domain.com

Custom domains are not required for the initial MVP.

The architecture should allow custom domains later.

17. Product Listing

Customers can:

View products
Search by product name
Browse categories
Open product details

MVP search is name-based.

Advanced search is outside MVP.

18. Product Details

Product details display:

Product name
Description
Images
Variant options
Price
Availability
Add to Cart

Unavailable variants cannot be purchased.

19. Cart

Customer can:

Add product
Change quantity
Remove item
View subtotal

The cart must validate product and inventory availability before checkout.

20. Checkout

Checkout collects:

Customer Information
Name
Email
Phone
Shipping Information
Governorate
City
Address
Building
Apartment
Additional information
Payment
Payment method

MVP payment provider:

Paymob.

21. Checkout Validation

Before creating an order, the backend must validate:

Product still exists
Product is active
Variant is active
Price is current
Requested quantity is available
Cart belongs to the correct store

The frontend cannot be trusted for these checks.

22. Order Creation

Successful checkout creates an Order.

Order contains:

Order number
Customer
Items
Prices
Quantities
Shipping address
Payment status
Order status
Totals

Order item data is snapshotted.

23. Order Number

Orders have:

Internal UUID
Human-readable order number

Example:

ORD-2026-000001

Order numbers are unique per store.

24. Payment Flow

MVP:

Checkout
   ↓
Create Payment Attempt
   ↓
Redirect/Payment Interface
   ↓
Paymob
   ↓
Payment Result
   ↓
Webhook
   ↓
Verify
   ↓
Update Payment
   ↓
Update Order

The webhook is authoritative for payment confirmation.

25. Payment Failure

If payment fails:

Payment is marked failed.
Order remains in an appropriate pending/payment-failed state.
Customer may retry payment where supported.
Inventory reservations must be handled according to reservation rules.

The system must not create duplicate orders because of payment retry.

26. Merchant Order Management

Merchant can:

View orders
Search orders
Filter orders
Open order details
Update eligible order statuses
Cancel eligible orders
View payment status
27. Order Details

Order details display:

Order number
Customer
Items
Quantity
Price
Total
Payment status
Order status
Shipping information
Created date
28. Customer Management

Merchant can:

View customers
Search customers
View customer details
View order history

Customer records are store-specific.

29. CMS

The merchant can manage basic storefront content.

MVP sections:

Hero
Banner
Text
Image
Featured products
Category grid

Sections can be reordered.

30. Media

Merchant can upload:

Product images
Store logo
CMS images

Images are stored in Supabase Storage.

The system should validate:

File type
File size
31. Store Settings

Merchant can configure:

Store name
Store description
Logo
Currency
Timezone
Basic storefront settings

Advanced settings are deferred.

32. Subscription

The product follows:

Free Trial
    ↓
Subscription Required

During the active trial:

Store is operational.
Merchant has normal access.

After expiration:

Admin becomes read-only.
Storefront is disabled.
Data is retained.

After subscription:

Store becomes operational again.
33. Empty States

Every major dashboard section must have a useful empty state.

Examples:

No products:

You haven't added any products yet.
[Add Product]

No orders:

You haven't received any orders yet.

No customers:

Customers will appear here after their first order.
34. Loading States

All asynchronous screens must provide loading feedback.

The system must avoid blank screens during API requests.

35. Error States

Errors must be understandable to the user.

Example:

Instead of:

500 Internal Server Error

show:

Something went wrong while creating the product.
Please try again.

Technical details should be logged internally.

36. Responsive Design

The storefront must support:

Desktop
Tablet
Mobile

The admin dashboard should prioritize desktop but remain usable on smaller screens.

37. SEO

Storefront pages must support:

Server-side rendering where appropriate
Page titles
Meta descriptions
SEO-friendly URLs
Product metadata

The MVP must not rely exclusively on client-side rendering.

38. Performance

Critical storefront pages should load quickly.

The implementation should use:

Server rendering
Static generation where appropriate
Image optimization
Efficient database queries

Premature caching infrastructure is not required.

39. Security

The product must enforce:

Authentication
Authorization
Store isolation
RLS
Input validation
Rate limiting
Secure secrets
Payment webhook verification
40. Accessibility

The UI should follow common accessibility practices:

Keyboard navigation
Form labels
Appropriate contrast
Semantic HTML
Accessible buttons and controls
Meaningful error messages
41. Auditability

Important business actions should be traceable.

Examples:

Inventory adjustment
Order status change
Payment event
Product changes

The exact audit-log implementation will be finalized during technical design.

42. Critical User Journeys
Journey 1 — Merchant Onboarding
Register
→ Create Store
→ Dashboard
Journey 2 — Product Creation
Dashboard
→ Products
→ Add Product
→ Add Variant
→ Set Price
→ Set Inventory
→ Save
→ Publish
Journey 3 — Customer Purchase
Storefront
→ Product
→ Add to Cart
→ Checkout
→ Paymob
→ Payment
→ Confirmation
Journey 4 — Merchant Order Processing
Dashboard
→ Orders
→ Open Order
→ Confirm
→ Processing
→ Shipped
→ Delivered
43. MVP Definition of Done

The MVP is not considered complete until a real end-to-end flow works:

Merchant
→ Registration
→ Store Creation
→ Product Creation
→ Variant Creation
→ Inventory
→ Publication

Customer
→ Storefront
→ Product
→ Cart
→ Checkout
→ Payment

Merchant
→ Order
→ Payment Status
→ Order Management

The flow must work without manual database manipulation.

44. Out of Scope

The following must not be implemented as part of MVP unless explicitly approved:

Meta integration
Facebook integration
Instagram integration
WhatsApp
Advanced analytics
Advanced search
Meilisearch
Multi-location inventory
Marketplace
Advanced shipping automation
AI features
Full ETA integration
Custom domain
App marketplace
45. Product Development Principle

Every feature must answer:

Who needs it?
What problem does it solve?
Is it required for MVP?
What happens if it fails?
How will we test it?

If a feature does not provide clear MVP value, it should be deferred.

46. PRD Governance

This document is a controlled product specification.

AI agents must not:

Add undocumented features
Change business behavior
Remove requirements
Change user flows

without explicit approval.

Any significant product behavior change must update the PRD.