/**
 * CATALOG DATABASE INTEGRATION TESTS — BLOCKED
 * =============================================
 *
 * Status: BLOCKED — PostgreSQL unavailable.
 *
 * A live PostgreSQL instance (DATABASE_URL) is not available in the current
 * environment. These tests REQUIRE a real database and therefore CANNOT be
 * executed. They are intentionally defined with `describe.skip` so they are
 * visible, clearly marked, and can be enabled immediately once a database is
 * reachable (remove the `.skip`).
 *
 * What they would verify (matching the FINAL database contract):
 *   - atomic Product + Default ProductVariant creation (docs/DATABASE.md §28)
 *   - product "at least one variant" invariant defense
 *   - store-scoped unique constraints (products/categories slug,
 *     product_variants sku)
 *   - product_categories UNIQUE (product_id, category_id) duplicate prevention
 *   - composite store-scoped FKs (no cross-tenant links possible at the DB)
 *   - RLS policies for products / product_variants / categories /
 *     product_categories (docs/DATABASE.md §29.3)
 *   - tenant isolation of the catalog tables
 *   - guarded conditional lifecycle UPDATEs under concurrency (§26.2)
 *
 * These scenarios are NOT covered by any passing test in this phase.
 */
describe.skip('Catalog database integration — BLOCKED — PostgreSQL unavailable', () => {
  describe('product creation transaction (docs/DATABASE.md §28)', () => {
    it.todo('creates Product + Default ProductVariant atomically');
    it.todo(
      'rolls back the Product row when the Default ProductVariant creation fails (no orphan product)',
    );
    it.todo('a failed product creation leaves no rows behind (insert then abort)');
  });

  describe('product >= 1 variant invariant (docs/DOMAIN-MODEL.md §7.1)', () => {
    it.todo('the application publish path rejects a product with zero variants');
  });

  describe('store-scoped unique constraints', () => {
    it.todo('enforces UNIQUE (store_id, slug) on products');
    it.todo('enforces UNIQUE (store_id, slug) on categories');
    it.todo('enforces UNIQUE (store_id, sku) on product_variants (multiple NULLs allowed)');
    it.todo('allows the same slug/SKU in different stores');
  });

  describe('product_categories constraints', () => {
    it.todo('enforces UNIQUE (product_id, category_id): a duplicate link is rejected');
    it.todo('composite FK (store_id, product_id) rejects a cross-tenant product link');
    it.todo('composite FK (store_id, category_id) rejects a cross-tenant category link');
    it.todo('deleting a link row (unassign) succeeds and does not touch products/categories');
  });

  describe('RLS policies for catalog tables (docs/DATABASE.md §29.3)', () => {
    it.todo('products: SELECT/INSERT/UPDATE/DELETE are tenant-isolated');
    it.todo('product_variants: SELECT/INSERT/UPDATE/DELETE are tenant-isolated');
    it.todo('categories: SELECT/INSERT/UPDATE/DELETE are tenant-isolated');
    it.todo('product_categories: SELECT/INSERT/DELETE are tenant-isolated');
    it.todo('the anon role cannot read non-public catalog rows');
  });

  describe('tenant isolation for catalog tables', () => {
    it.todo('Store A cannot read Store B products');
    it.todo('Store A cannot update/archive Store B products');
    it.todo('Store A cannot read/modify Store B variants');
    it.todo('Store A cannot read/modify Store B categories');
    it.todo('Store A cannot link its products to Store B categories (and vice versa)');
  });

  describe('concurrency-safe lifecycle transitions (docs/DATABASE.md §26.2)', () => {
    it.todo('concurrent publish requests transition a product exactly once');
    it.todo('concurrent archive requests transition a variant/category exactly once');
  });
});
