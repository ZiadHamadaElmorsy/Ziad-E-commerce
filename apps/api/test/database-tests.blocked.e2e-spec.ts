/**
 * DATABASE INTEGRATION TESTS — BLOCKED
 * ====================================
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
 *   - RLS behavioral tests (DATABASE.md section 29.7)
 *   - concurrency tests (DATABASE.md section 26)
 *   - transaction behavior tests (DATABASE.md section 28)
 *   - migration execution on a clean database
 *
 * These scenarios are NOT covered by any passing test in this phase.
 */
describe.skip('Database integration — BLOCKED — PostgreSQL unavailable', () => {
  describe('migration', () => {
    it.todo('applies the initial migration to a clean database without errors');
    it.todo('exposes exactly the 28 MVP tables');
    it.todo('exposes app.current_store_id() and app.set_current_store_id(uuid)');
    it.todo('enables RLS on all 28 tenant tables');
  });

  describe('tenant context helpers', () => {
    it.todo('app.current_store_id() returns NULL before any bind');
    it.todo('app.set_current_store_id(uuid) binds the store for the transaction');
    it.todo('resetting the context returns current_store_id() to NULL');
  });

  describe('RLS tenant isolation (DATABASE.md section 29.7)', () => {
    it.todo('Store A cannot read Store B rows');
    it.todo('Store A cannot write Store B rows');
    it.todo('Store A cannot delete Store B rows');
    it.todo('anonymous users cannot read merchant tables');
    it.todo(
      'inherited-ownership tables (cart_items, order_items, payment_attempts) enforce the parent tenant boundary',
    );
    it.todo('stores policy allows reading only stores the member belongs to');
    it.todo('users policy allows reading only the authenticated user row');
  });

  describe('concurrency (DATABASE.md section 26)', () => {
    it.todo('concurrent reservations never oversell (atomic guarded UPDATE)');
    it.todo('payment success webhook is idempotent under concurrent delivery');
    it.todo('reservation release is safe under concurrent cancellation + expiry sweep');
  });

  describe('transactions (DATABASE.md section 28)', () => {
    it.todo('checkout rolls back fully when order creation fails');
    it.todo('payment success consumes reservations and confirms the order atomically');
    it.todo('payment failure releases reservations atomically');
    it.todo('order cancellation releases ACTIVE reservations in the same transaction');
  });

  describe('TransactionService + RlsTenantBinder against PostgreSQL', () => {
    it.todo('TransactionService.runWithTenant binds then resets the tenant on a real connection');
    it.todo('a connection returned to the pool carries no leftover tenant context');
  });
});
