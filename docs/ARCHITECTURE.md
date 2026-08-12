# Ziad E-commerce — Architecture Specification

**Version:** 1.0  
**Status:** Draft  
**Owner:** Ziad  
**Technical Lead:** CTO / AI-assisted development

---

# 1. Purpose

This document defines the technical architecture of the Ziad E-commerce SaaS platform.

It is the primary technical reference for implementation.

All developers and AI coding agents must follow this document.

No AI agent may introduce architectural changes without explicit approval.

---

# 2. Product Context

Ziad E-commerce is an Egypt-first multi-tenant SaaS e-commerce platform.

The platform allows merchants to:

- Create and manage an online store.
- Manage products and variants.
- Manage inventory.
- Manage customers.
- Manage orders.
- Accept payments.
- Configure storefront content.
- Manage store pages and sections.
- Synchronize catalog data with external platforms.
- Manage SaaS subscription/billing.

Customers can:

- Browse stores.
- Browse products.
- Add products to cart.
- Checkout.
- Pay.
- Receive order confirmation.

---

# 3. Architecture Principles

The system follows these principles:

## 3.1 Modular Monolith First

The backend will initially be implemented as a modular monolith.

Microservices are explicitly out of scope for MVP.

Modules must have clear responsibilities and boundaries.

---

## 3.2 Database as the Source of Truth

PostgreSQL is the primary source of truth for:

- Products
- Variants
- Inventory
- Customers
- Orders
- Payments
- Store configuration
- CMS data

External systems must not become the authoritative source for core commerce data.

---

## 3.3 Security by Default

Security must be enforced at multiple levels:

- Authentication
- Authorization
- Tenant isolation
- PostgreSQL Row-Level Security
- Input validation
- Webhook verification
- Secret management
- Audit logging

Application-layer filtering alone is not considered sufficient tenant isolation.

---

## 3.4 Explicit Domain Boundaries

Each business domain must have a clearly defined module.

Modules should communicate through explicit interfaces and events where appropriate.

Business logic must not be randomly distributed across controllers, frontend components, or database triggers.

---

## 3.5 Reliability Before Scale

The system must prioritize correctness and reliability before premature horizontal scaling.

The MVP will not introduce:

- Database sharding
- Kubernetes
- Service mesh
- Multi-region infrastructure
- Complex event streaming platforms

unless future measured requirements justify them.

---

# 4. High-Level Architecture

```text
                         INTERNET
                             |
              +--------------+--------------+
              |                             |
              v                             v
       +--------------+              +--------------+
       | Storefront   |              | Admin Panel  |
       |   Next.js    |              |   Next.js    |
       +------+-------+              +------+-------+
              |                             |
              +--------------+--------------+
                             |
                             v
                    +----------------+
                    |    NestJS      |
                    |  API Backend   |
                    | Modular        |
                    | Monolith       |
                    +-------+--------+
                            |
             +--------------+--------------+
             |              |              |
             v              v              v
      +------------+  +------------+  +------------+
      | PostgreSQL |  |  Supabase  |  |  Storage   |
      | Database   |  |    Auth    |  |   Media    |
      +------------+  +------------+  +------------+
                            |
                            v
                  External Integrations
                  +----------------------+
                  | Paymob               |
                  | Meta                 |
                  | Email                |
                  +----------------------+