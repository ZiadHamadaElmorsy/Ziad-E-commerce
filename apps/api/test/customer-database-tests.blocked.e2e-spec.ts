/**
 * CUSTOMER DATABASE INTEGRATION TESTS — BLOCKED
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
 *   - the initial migration applies cleanly to a fresh database
 *   - customers UNIQUE (store_id, email) — same-email duplicates rejected,
 *     multiple NULLs allowed, same email in another Store allowed
 *   - customers.store_id FK (RESTRICT — a Store with customers cannot be
 *     deleted)
 *   - customer_addresses store-scoped composite FK (store_id, customer_id):
 *     an address can never reference a customer of another Store
 *   - customer deletion behavior (DATABASE.md §9/§25.1): addresses CASCADE,
 *     orders/carts SET NULL
 *   - RLS policies for customers / customer_addresses (docs/DATABASE.md §29.3)
 *   - tenant isolation of the two customer tables at the database level
 *   - transaction rollback (failed address creation leaves nothing behind)
 *
 * These scenarios are NOT covered by any passing test in this phase.
 */
describe.skip('Customer database integration — BLOCKED — PostgreSQL unavailable', () => {
  describe('migration', () => {
    it.todo('applies the initial migration cleanly to a fresh database');
  });

  describe('customers UNIQUE (store_id, email) (docs/DATABASE.md §10/§18.2)', () => {
    it.todo('rejects a second customer with the same email in the same Store');
    it.todo('allows the same email in a different Store');
    it.todo('allows multiple customers with a NULL email (NULLs are distinct)');
  });

  describe('customers store_id foreign key (docs/DATABASE.md §9)', () => {
    it.todo('rejects a customer referencing a non-existent Store');
    it.todo('a Store with customers cannot be deleted (RESTRICT)');
  });

  describe('customer_addresses composite store-scoped FK (docs/DATABASE.md §9.1)', () => {
    it.todo('rejects an address whose (store_id, customer_id) pair is cross-tenant');
    it.todo('rejects an address referencing a non-existent customer');
    it.todo('rejects an address with a store_id that does not match the customer store');
  });

  describe('customer deletion behavior (docs/DATABASE.md §9/§25.1)', () => {
    it.todo('deleting a customer cascades to customer_addresses');
    it.todo('deleting a customer sets orders.customer_id to NULL (SET NULL safety net)');
    it.todo('deleting a customer sets carts.customer_id to NULL (SET NULL safety net)');
  });

  describe('RLS policies for customer tables (docs/DATABASE.md §29.3)', () => {
    it.todo('customers: SELECT/INSERT/UPDATE/DELETE are tenant-isolated');
    it.todo('customer_addresses: SELECT/INSERT/UPDATE/DELETE are tenant-isolated');
    it.todo('writes with no tenant context (app.current_store_id() NULL) are rejected');
    it.todo('the anon role cannot read customers / customer_addresses');
  });

  describe('tenant isolation for customer tables', () => {
    it.todo('Store A cannot read Store B customers');
    it.todo('Store A cannot update/delete Store B customers');
    it.todo('Store A cannot read/modify Store B customer_addresses');
  });

  describe('transaction rollback (docs/DATABASE.md §28)', () => {
    it.todo('a failed address creation (constraint violation) leaves no rows behind');
    it.todo('a failed multi-record address write rolls back the whole transaction');
  });
});
