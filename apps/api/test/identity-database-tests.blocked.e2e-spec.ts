/**
 * IDENTITY & TENANCY DATABASE INTEGRATION TESTS — BLOCKED
 * ========================================================
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
 *   - atomic Store + OWNER membership creation (DATABASE.md §28)
 *   - stores.slug global UNIQUE enforcement
 *   - the partial UNIQUE (store_id) WHERE role = 'OWNER' single-owner rule
 *   - the UNIQUE (store_id, user_id) membership rule
 *   - RLS policies for users / stores / store_memberships (DATABASE.md §29.5)
 *   - tenant isolation of the identity tables
 *
 * These scenarios are NOT covered by any passing test in this phase.
 */
describe.skip('Identity & Tenancy database integration — BLOCKED — PostgreSQL unavailable', () => {
  describe('store creation transaction (DATABASE.md §28)', () => {
    it.todo('creates Store + ACTIVE OWNER membership atomically');
    it.todo('rolls back the Store row when OWNER membership creation fails (no orphan store)');
    it.todo('a failed creation leaves no rows behind (insert then abort)');
  });

  describe('store slug uniqueness', () => {
    it.todo('enforces the global UNIQUE stores.slug index (second insert fails)');
  });

  describe('single OWNER per store', () => {
    it.todo('enforces the partial UNIQUE (store_id) WHERE role = OWNER index');
  });

  describe('store_memberships uniqueness', () => {
    it.todo('enforces UNIQUE (store_id, user_id): one membership per user per store');
  });

  describe('RLS policies for identity tables (DATABASE.md §29.5)', () => {
    it.todo('users: an authenticated user can select only their own row');
    it.todo(
      'stores: member_store_select exposes only stores the member has an ACTIVE membership in',
    );
    it.todo('store_memberships: member_membership_select exposes only own-store memberships');
    it.todo(
      'writes to stores / store_memberships require the service role (no authenticated write policy)',
    );
  });

  describe('tenant isolation for identity tables', () => {
    it.todo('User A cannot read User B rows through RLS');
    it.todo('Store A members cannot observe Store B memberships');
    it.todo('an INACTIVE membership grants no store/membership visibility');
  });
});
