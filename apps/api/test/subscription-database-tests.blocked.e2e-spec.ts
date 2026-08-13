/**
 * BLOCKED database-level Subscription tests (PHASE 14).
 *
 * The Subscription persistence contract is defined in DATABASE.md §7.4/§9/§10/
 * §12/§20/§25/§29 and shipped by the initial migration:
 *   - subscriptions (status subscription_status DEFAULT 'TRIAL'; trial_started_at;
 *     trial_ends_at; activated_at; expires_at)
 *   - store_id UNIQUE (1:1 with Store) — `subscriptions_store_id_key`
 *   - status index for expiry sweeps / access-overlay checks
 *   - store_id FK stores ON DELETE RESTRICT
 *   - `member_subscription_select` RLS policy (members may read their own store's
 *     subscription; writes run through the service role)
 *   - application-enforced lifecycle (TRIAL -> ACTIVE, TRIAL -> EXPIRED,
 *     ACTIVE -> EXPIRED, EXPIRED -> ACTIVE) — the DB constrains enum membership
 *   - subscription rows are retained (delete/retention rules §25.1)
 *   - "No automatic deletion of commerce data" applies to subscription expiry
 *
 * These tests require a real PostgreSQL instance with the FINAL schema applied
 * (migration `20260812000000_init`), RLS enabled and Supabase-compatible
 * plumbing (anon / authenticated roles). PostgreSQL is NOT available in this
 * environment, so the whole suite is `describe.skip` + `it.todo` — following
 * the exact convention established by every prior phase.
 *
 * NOTHING in this file is executed; nothing is faked. When a real database is
 * available, convert each `it.todo` into a real assertion and run the suite.
 */
describe('Subscription database tests (BLOCKED — PostgreSQL unavailable)', () => {
  describe.skip('Database / RLS / Subscription behavior', () => {
    it.todo('subscriptions.store_id is UNIQUE — a Store can have exactly one subscription row');

    it.todo(
      'subscription_status enum rejects an unknown status (no PAST_DUE / CANCELLED / SUSPENDED)',
    );

    it.todo('subscriptions.status DEFAULT is TRIAL for a newly inserted row');

    it.todo(
      'subscriptions.store_id FK RESTRICT blocks deleting a Store that owns a subscription row',
    );

    it.todo(
      'RLS: a merchant sees ONLY their own store subscription row (member_subscription_select)',
    );

    it.todo(
      'RLS: a merchant cannot read another store subscription row (no cross-tenant existence leak)',
    );

    it.todo(
      'RLS: the authenticated role cannot INSERT/UPDATE subscriptions (writes run through the service role)',
    );

    it.todo(
      'the status index supports expiry sweeps / access-overlay checks on subscriptions.status',
    );

    it.todo(
      'lazy expiry is concurrency-safe: two concurrent TRIAL->EXPIRED guarded updates affect exactly one row',
    );

    it.todo(
      'the Store + OWNER membership + TRIAL subscription creation rolls back atomically on failure',
    );

    it.todo('subscription rows are retained — there is no documented DELETE path');

    it.todo(
      'expiry never deletes commerce data: an EXPIRED subscription leaves all store data intact',
    );

    it.todo(
      'the service role can transition subscription status (TRIAL->ACTIVE, EXPIRED->ACTIVE reactivation)',
    );
  });
});
