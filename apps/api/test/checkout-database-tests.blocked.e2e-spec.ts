/**
 * BLOCKED database-level Checkout tests (PHASE 7).
 *
 * These tests require a real PostgreSQL instance with the FINAL schema applied
 * (migration `20260812000000_init`), RLS enabled and Supabase-compatible
 * plumbing. PostgreSQL is NOT available in this environment, so the whole suite
 * is `describe.skip` + `it.todo` — following the exact convention established
 * by the Cart/Inventory phases.
 *
 * NOTHING in this file is executed; nothing is faked. When a real database is
 * available, convert each `it.todo` into a real assertion and run the suite.
 */
describe('Checkout database tests (BLOCKED — PostgreSQL unavailable)', () => {
  describe.skip('Database / RLS / concurrency behavior', () => {
    it.todo(
      'runs a clean migration and applies the FINAL schema (orders, order_items, reservations)',
    );

    it.todo(
      'persists the PENDING Order with purchase-time snapshots and a Store-unique order_number',
    );

    it.todo(
      'persists OrderItems with product/variant name, SKU, unit_price, quantity, line_total snapshots',
    );

    it.todo('creates ACTIVE reservations and links them to the order_id after order creation');

    it.todo(
      'transitions the cart to COMPLETED with completed_at set at the same commit as the order',
    );

    it.todo(
      'rolls back the ENTIRE checkout when inventory is insufficient (no order, no partial reservations)',
    );

    it.todo('rolls back the ENTIRE checkout when order creation fails (no orphaned reservations)');

    it.todo('rolls back the ENTIRE checkout when the cart transition to COMPLETED fails');

    it.todo('enforces UNIQUE (store_id, order_number) under concurrent checkouts');

    it.todo(
      'enforces UNIQUE (store_id, idempotency_key) and returns the existing order on a retry',
    );

    it.todo('prevents two concurrent checkouts of the same cart from producing two orders');

    it.todo(
      'prevents overselling under concurrent reservations (atomic guarded reserved increment)',
    );

    it.todo('enforces the composite store-scoped FKs (order -> customer, order_item -> variant)');

    it.todo('enforces CHECK constraints (grand_total consistency, quantity > 0, line_total >= 0)');

    it.todo(
      'enforces RLS tenant isolation for checkout reads/writes (Store A cannot check out Store B carts)',
    );

    it.todo(
      'never leaks cross-tenant existence (unknown guest token returns NOT_FOUND, not FORBIDDEN)',
    );

    it.todo(
      'releases ACTIVE reservations when the linked order is cancelled (later phase, guarded)',
    );
  });
});
