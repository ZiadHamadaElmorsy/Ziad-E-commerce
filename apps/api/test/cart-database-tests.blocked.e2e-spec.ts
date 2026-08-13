/**
 * CART DATABASE INTEGRATION TESTS — BLOCKED
 * =========================================
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
 *   - the initial migration applies cleanly to a fresh database
 *   - carts: CHECK (customer_id IS NOT NULL OR guest_token IS NOT NULL)
 *   - carts: partial UNIQUE (store_id, guest_token) WHERE guest_token IS NOT NULL
 *   - carts: store_id FK (RESTRICT — a Store with carts cannot be deleted)
 *   - carts: customer_id FK (SET NULL safety net)
 *   - cart_items: UNIQUE (cart_id, variant_id) — one line per variant per cart
 *   - cart_items: CHECK (quantity > 0)
 *   - cart_items: cart_id FK (CASCADE — deleting a cart deletes its items)
 *   - cart_items: variant_id FK (RESTRICT — a referenced variant cannot be
 *     deleted; an archived variant remains valid inside existing carts)
 *   - RLS policies for carts / cart_items (docs/DATABASE.md §29.3/§29.4)
 *   - tenant isolation: a cart can never reference a product_variant of
 *     another Store (composite store-scoped FK + RLS through the parent cart)
 *   - transaction rollback (failed cart_item write leaves no partial rows)
 *   - concurrent cart_item mutations (duplicate add race -> UNIQUE violation;
 *     no duplicate lines are ever committed)
 *
 * These scenarios are NOT covered by any passing test in this phase.
 */
describe.skip('Cart database integration — BLOCKED — PostgreSQL unavailable', () => {
  describe('migration', () => {
    it.todo('applies the initial migration cleanly to a fresh database');
  });

  describe('carts identity CHECK (docs/DATABASE.md §7.14/§17.2)', () => {
    it.todo('rejects a cart with neither customer_id nor guest_token');
    it.todo('accepts a guest cart (guest_token only)');
    it.todo('accepts an authenticated-customer cart (customer_id only)');
  });

  describe('carts partial UNIQUE (store_id, guest_token) (docs/DATABASE.md §10)', () => {
    it.todo('rejects a second cart with the same guest_token in the same Store');
    it.todo('allows the same guest_token in a different Store');
    it.todo('allows multiple carts with a NULL guest_token');
  });

  describe('carts foreign keys (docs/DATABASE.md §9)', () => {
    it.todo('rejects a cart referencing a non-existent Store (RESTRICT)');
    it.todo('a Store with carts cannot be deleted (RESTRICT)');
    it.todo('deleting a Customer sets carts.customer_id to NULL (SET NULL safety net)');
  });

  describe('cart_items UNIQUE (cart_id, variant_id) (docs/DATABASE.md §7.15)', () => {
    it.todo('rejects a second line for the same variant in the same cart');
    it.todo('allows the same variant in a different cart');
    it.todo('allows different variants in the same cart');
  });

  describe('cart_items CHECK (quantity > 0) (docs/DATABASE.md §7.15)', () => {
    it.todo('rejects quantity = 0');
    it.todo('rejects a negative quantity');
    it.todo('accepts positive quantities');
  });

  describe('cart_items foreign keys (docs/DATABASE.md §9)', () => {
    it.todo('deleting a cart cascades to its cart_items (CASCADE)');
    it.todo('a variant referenced by a cart_item cannot be deleted (RESTRICT)');
    it.todo('an archived variant already in a cart remains valid');
  });

  describe('tenant isolation (docs/DATABASE.md §9.1/§29.4)', () => {
    it.todo('a cart can never reference a product_variant of another Store');
    it.todo('Store A cannot read Store B carts');
    it.todo('Store A cannot read/modify Store B cart_items (RLS through parent cart)');
  });

  describe('RLS policies for cart tables (docs/DATABASE.md §29.3/§29.4)', () => {
    it.todo('carts: SELECT/INSERT/UPDATE/DELETE are tenant-isolated');
    it.todo('cart_items: inherited-ownership policy resolves the Store through carts');
    it.todo('writes with no tenant context (app.current_store_id() NULL) are rejected');
    it.todo('the anon role cannot read carts / cart_items');
  });

  describe('transactions (docs/DATABASE.md §28)', () => {
    it.todo('a failed cart_item write (constraint violation) leaves no partial rows behind');
    it.todo('a failed cart + item multi-write rolls back the whole transaction');
  });

  describe('concurrency', () => {
    it.todo('a duplicate-item race surfaces a UNIQUE (cart_id, variant_id) violation exactly once');
    it.todo('concurrent quantity updates on the same line serialize without lost updates');
  });
});
