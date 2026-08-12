# Ziad E-commerce — AI Agent Rules

**Version:** 1.0
**Status:** Active
**Owner:** Ziad
**Role:** CTO / AI-assisted development

---

# 1. Purpose

This document defines the mandatory rules for every AI coding agent working on the Ziad E-commerce project.

Examples of AI coding agents include:

- Claude Code
- DeepSeek
- Cursor
- GitHub Copilot
- Codex
- Other coding agents

These rules exist to prevent:

- Uncontrolled scope expansion
- Architectural drift
- Security vulnerabilities
- Tenant data leakage
- Duplicate implementations
- Breaking existing functionality
- Unnecessary dependencies
- Premature optimization
- AI-generated technical debt

This document is mandatory.

---

# 2. Source of Truth

Before implementing any feature, the AI agent MUST read the relevant project documentation.

The documentation hierarchy is:

```text
01-BRD.md
      ↓
02-MVP-SCOPE.md
      ↓
03-PRD.md
      ↓
04-ARCHITECTURE.md
      ↓
05-DOMAIN-MODEL.md
      ↓
06-API-SPEC.md
      ↓
07-USER-STORIES.md
      ↓
08-AI-AGENT-RULES.md

If two documents conflict:

Stop implementation.
Identify the conflict.
Report the conflict.
Do not silently choose an interpretation.

The AI agent must never invent business requirements.

3. CTO Authority

The AI agent is an implementation assistant.

The AI agent is NOT the product owner.

The AI agent must not independently change:

Business requirements
Product scope
Pricing model
Architecture
Database strategy
Authentication strategy
Tenant model
Payment strategy
External integrations
Security model

Any architectural or business change requires explicit approval.

4. One Task at a Time

The AI agent must work on one approved task at a time.

Correct:

TASK-001
Implement Store Creation

Incorrect:

Implement Store Creation
+
Implement Products
+
Implement Authentication
+
Refactor Database
+
Add Redis

Do not combine unrelated work.

5. Before Coding

Before writing code, the AI agent must:

Step 1

Read the relevant documentation.

Step 2

Inspect the existing repository.

Step 3

Understand the current implementation.

Step 4

Identify affected modules.

Step 5

Identify affected database tables.

Step 6

Identify API changes.

Step 7

Identify security implications.

Step 8

Identify tests that must be created or updated.

Step 9

Produce a short implementation plan.

Only after this process should coding begin.

6. Never Assume the Repository Is Empty

The AI agent must inspect the existing code before creating files.

Do NOT:

Recreate existing modules.
Duplicate services.
Duplicate database models.
Create alternative authentication systems.
Replace working code without reason.
Introduce a second implementation of the same feature.

Before creating a new component/service/module, search the repository.

7. Architecture Rules

The system is a Modular Monolith.

The AI agent must preserve this architecture.

Do NOT introduce:

Microservices
Kubernetes
Service mesh
Kafka
Event-driven distributed architecture
Database sharding
Multi-region deployment
Complex infrastructure

unless explicitly approved.

8. Backend Rules

Backend:

NestJS
TypeScript
PostgreSQL
Supabase

Backend business logic must live in appropriate domain modules.

Do not put business logic directly inside:

Controllers
DTOs
Frontend components
Database triggers

Controllers should remain thin.

Preferred structure:

Controller
    ↓
Application Service
    ↓
Domain Logic
    ↓
Repository / Data Access
    ↓
PostgreSQL
9. Module Boundaries

Core modules include:

Auth
Stores
Users
Catalog
Products
Variants
Categories
Inventory
Customers
Cart
Checkout
Orders
Payments
CMS
Media
Subscriptions
Notifications
Integrations
Audit
Analytics

Each module should own its own business logic.

Avoid uncontrolled cross-module access.

10. Database Rules

Primary database:

PostgreSQL

Database is the source of truth for commerce data.

Do not store authoritative commerce state only in:

Redis
Browser localStorage
Frontend state
External APIs
Meta
Payment provider
11. Multi-Tenant Rules

Every tenant-owned entity MUST be securely associated with a Store.

The default pattern is:

store_id

Tenant isolation must be enforced through:

Application authorization
+
PostgreSQL Row-Level Security

Application filtering alone is NOT sufficient.

12. Tenant Security Rule

Every protected operation must verify:

Authenticated User
        ↓
Store Membership
        ↓
Role / Permission
        ↓
Resource belongs to Store

The following must never happen:

GET /products/123

and simply trusting that the current user owns product 123.

The backend must verify ownership through the Store context.

13. Cross-Tenant Testing

Every major tenant-owned resource must include tests proving:

Store A cannot:

READ Store B data
CREATE data inside Store B
UPDATE Store B data
DELETE Store B data

Any discovered cross-tenant access vulnerability is a critical defect.

14. Authentication

Use:

Supabase Auth

Do not create a custom authentication system unless explicitly approved.

Never:

Store plaintext passwords.
Return passwords through APIs.
Log passwords.
Log authentication secrets.
Hardcode authentication secrets.
15. Authorization

Authentication answers:

Who are you?

Authorization answers:

What are you allowed to do?

Every protected business operation requires both.

16. API Rules

API contracts must follow:

06-API-SPEC.md

Do not change API request or response structures without updating the API specification.

APIs must have:

Input validation
Authentication where required
Authorization where required
Proper HTTP status codes
Consistent error responses
Tenant isolation
17. Validation

Never trust client input.

Validate:

Request body
Query parameters
Route parameters
IDs
Quantities
Prices
Inventory
Payment information
Store ownership

The frontend is NOT a security boundary.

18. Price Security

The client must never be trusted for authoritative pricing.

Incorrect:

POST /checkout

{
  "total": 100
}

and trusting the client total.

Correct:

Client Cart
     ↓
Backend loads current Product/Variant
     ↓
Backend calculates prices
     ↓
Backend validates inventory
     ↓
Backend calculates totals
     ↓
Order created
19. Inventory Rules

Inventory operations must be transaction-safe.

Never implement:

READ quantity
↓
Check quantity
↓
WRITE quantity

as independent operations for concurrent checkout.

Use atomic database operations / transactions.

The system must prevent:

quantity < 0

where applicable.

20. Order Rules

Orders must preserve historical information.

OrderItems must snapshot relevant purchase information such as:

Product name
Variant information
SKU where applicable
Unit price
Quantity

Changing a Product later must NOT rewrite historical Orders.

21. Payment Rules

Payment is a critical domain.

Never trust:

Client payment status
Client total
Client payment reference

Payment confirmation must come from a verified payment provider response/webhook.

Every payment webhook must:

Verify authenticity
      ↓
Persist event where appropriate
      ↓
Check duplicate event
      ↓
Process safely
      ↓
Update Payment
      ↓
Update Order
22. Idempotency

Critical operations must be idempotent.

Applicable operations include:

Order creation
Payment initiation
Payment webhook processing
Inventory reservation
External integration jobs

Repeated requests must not create duplicate business outcomes.

23. Webhook Rules

External webhooks are assumed to be retryable / potentially duplicated.

Never assume:

One webhook = One delivery

Use provider event IDs or equivalent unique identifiers.

Duplicate webhook processing must be safe.

24. External API Rules

External services include:

Paymob
Meta
Email providers
Other approved integrations

Never make the core system dependent on an external API being permanently available.

External failures must be handled gracefully.

25. Retry Rules

Retry transient failures using controlled retry strategies.

Do not create infinite retries.

Preferred strategy:

Attempt 1
↓
Short delay
↓
Attempt 2
↓
Longer delay
↓
Attempt 3
↓
Mark failed

Retry logic must be idempotent.

26. Frontend Rules

Frontend:

Next.js
React
TypeScript

The frontend must:

Use typed API contracts.
Handle loading states.
Handle errors.
Handle empty states.
Handle validation errors.
Avoid duplicating backend business logic.
Never be treated as a security boundary.
27. Storefront Rules

The Storefront is public-facing.

Prioritize:

SEO
Performance
Accessibility
Responsive Design
Security

Use appropriate Next.js rendering strategies.

Do not convert the Storefront into a purely client-side application without explicit approval.

28. CMS Rules

CMS data must not bypass domain boundaries.

CMS controls presentation.

CMS must NOT directly modify:

Orders
Payments
Inventory
Customers

CMS may consume catalog information where appropriate.

29. Media Rules

Media must be associated with the appropriate Store.

Storage paths should follow a predictable structure such as:

{store_id}/products/{product_id}/...

Never allow one Store to manipulate another Store's media.

30. Error Handling

Errors must be:

Predictable
Structured
Safe
Useful to developers
Appropriate for users

Do not expose:

Database credentials
Stack traces in production
Secrets
Internal infrastructure details
Sensitive provider information
31. Logging

Logs should help diagnose failures.

Useful fields include:

request_id
user_id
store_id
operation
resource_id
timestamp
error_code

Never log:

passwords
tokens
API secrets
payment secrets
full sensitive customer information
32. Testing Rules

Critical business logic must have automated tests.

Priority testing areas:

Authentication
Authorization
Tenant Isolation
Product creation
Inventory
Checkout
Order creation
Payment handling
Webhook processing
Subscription enforcement
33. Test Pyramid

Preferred approach:

Unit Tests
     ↓
Integration Tests
     ↓
API / E2E Tests

Do not rely exclusively on manual testing.

34. Security Testing

Before marking a security-sensitive story complete, test:

Unauthenticated access
Unauthorized role
Wrong Store
Wrong resource ID
Modified request body
Modified price
Modified quantity
Duplicate request
Duplicate webhook
35. Dependency Rules

Do not install a new package just because it makes one small task easier.

Before adding a dependency:

Check whether the functionality already exists.
Check whether the project already has an equivalent dependency.
Check package maintenance status.
Evaluate security implications.
Evaluate bundle/runtime impact.
Explain why it is necessary.

AI agent must request approval before introducing major dependencies.

36. No Premature Infrastructure

Do not introduce infrastructure simply because it might be useful later.

Do NOT add by default:

Redis
BullMQ
Kafka
Elasticsearch
Meilisearch
Kubernetes
Docker Swarm
Microservices
Service Mesh
Read Replicas
Sharding
Multi-region

unless an approved requirement or measured bottleneck justifies it.

37. Database Migration Rules

Database changes must use migrations.

Never manually modify production schema without a migration.

Migrations must be:

Reproducible
Reviewable
Version controlled
Safe

Avoid destructive migrations unless explicitly approved.

38. Seed Data

Development seed data must:

Be deterministic where possible.
Never contain real customer data.
Never contain production secrets.
Be clearly separated from production data.
39. Environment Variables

Secrets must never be hardcoded.

Use environment variables for:

Database credentials
Supabase keys
Paymob secrets
Meta credentials
Email provider credentials
Other private keys

Provide safe example configuration through:

.env.example

Never commit:

.env

or production secrets.

40. Git Rules

Use Git continuously.

Preferred workflow:

Task
↓
Implement
↓
Test
↓
Review
↓
Commit

Commit messages should be meaningful.

Examples:

feat: add store creation
feat: implement product management
fix: prevent cross-tenant product access
test: add inventory concurrency tests
docs: update API specification
41. No Giant Commits

Avoid commits containing unrelated changes.

Bad:

feat: implement everything

Good:

feat: add store creation API
test: add store authorization tests
fix: enforce store ownership on store update
42. No Destructive Git Operations

AI agents must NOT run destructive commands such as:

git reset --hard
git clean -fd
git push --force

unless explicitly approved.

Do not delete user work.

43. No Silent Refactoring

Do not refactor unrelated code while implementing a feature.

If refactoring is necessary:

Explain why.
Keep it isolated.
Test affected functionality.
44. No Scope Creep

If an AI agent discovers a potentially useful feature:

Do NOT implement it automatically.

Instead:

Potential Improvement:
<description>

Reason:
<why it may be useful>

Impact:
<scope / architecture / cost>

Recommendation:
<optional recommendation>

Then wait for approval.

45. Definition of Done

A task is not complete until:

Requirements understood
        ↓
Implementation complete
        ↓
Validation complete
        ↓
Authorization complete
        ↓
Tenant isolation verified
        ↓
Tests added
        ↓
Tests passing
        ↓
Lint passing
        ↓
Type checking passing
        ↓
Build passing
        ↓
Documentation updated
        ↓
Git diff reviewed
        ↓
Commit created
46. AI Self-Review

Before reporting completion, the AI agent must ask itself:

Did I follow the architecture?
Did I follow the domain model?
Did I follow the API contract?
Did I follow the user story?
Did I introduce scope creep?
Did I introduce a new dependency?
Did I break tenant isolation?
Did I validate authorization?
Did I test failure cases?
Did I test duplicate requests?
Did I test external API failures?
Did I introduce security risks?
Did I modify unrelated code?

If any answer indicates a problem, fix it before completion.

47. Stop Conditions

The AI agent MUST stop and report instead of guessing when:

Requirements conflict.
API specification is missing.
Domain model is unclear.
A security decision is ambiguous.
A destructive database migration is required.
A major architectural change is required.
A third-party integration requires an unknown contract.
Existing implementation contradicts the documentation.
The task requires changing an approved business rule.
48. Required Agent Response Format

Before implementation:

## Understanding
<what I understand>

## Relevant Documentation
<documents reviewed>

## Plan
1. ...
2. ...
3. ...

## Files Expected to Change
- ...

## Database Changes
- ...

## API Changes
- ...

## Tests
- ...

## Risks
- ...

After implementation:

## Completed
- ...

## Files Changed
- ...

## Database Changes
- ...

## API Changes
- ...

## Tests
- ...

## Validation
- Lint: PASS/FAIL
- Typecheck: PASS/FAIL
- Tests: PASS/FAIL
- Build: PASS/FAIL

## Security Review
- Tenant isolation: PASS/FAIL
- Authorization: PASS/FAIL
- Input validation: PASS/FAIL

## Remaining Issues
- ...

## Commit
<commit hash/message>
49. Golden Rule

The AI agent must follow this principle:

Build only what is required, build it correctly, test it, secure it, document it, and never guess when a decision is unclear.

50. Final Rule

The AI agent is allowed to be proactive in implementation.

It is NOT allowed to be proactive in changing product decisions or architecture.

Implementation autonomy = YES

Product decision autonomy = NO

Architecture change autonomy = NO

Security compromise = NEVER