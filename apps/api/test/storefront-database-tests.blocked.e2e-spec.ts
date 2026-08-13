/**
 * BLOCKED database-level Storefront tests (PHASE 11).
 *
 * The public storefront read model is defined in DATABASE.md §5.4/§29.6: an
 * anonymous read-only access path that resolves a single Store from its public
 * slug/domain and exposes only published pages, ACTIVE products, purchasable
 * variants, ACTIVE categories and public store configuration. The initial
 * migration already ships the matching `public_storefront_select` policies for
 * the `anon` role.
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
describe('Storefront database tests (BLOCKED — PostgreSQL unavailable)', () => {
  describe.skip('Database / RLS / public-storefront behavior', () => {
    it.todo(
      'the anon role can read only the resolved Store: stores, ACTIVE products, ACTIVE variants, ACTIVE categories, PUBLISHED pages',
    );

    it.todo(
      'public storefront reads expose no DRAFT/ARCHIVED products, variants or categories and no non-PUBLISHED pages',
    );

    it.todo(
      "the anon role cannot read another Store's rows even with the slug/domain resolved to Store A",
    );

    it.todo('the anon role cannot write to any storefront table (INSERT/UPDATE/DELETE denied)');

    it.todo('the public storefront policy exposes stores only when status = ACTIVE');

    it.todo(
      'product_media/media are readable by anon only through the resolved Store (no cross-tenant media exposure)',
    );

    it.todo(
      'inventory availability is derived (on_hand - reserved) and never leaks raw quantities to the public role',
    );

    it.todo(
      'a missing inventory row is treated as not available by the storefront read path (fail closed)',
    );

    it.todo(
      'the public storefront never bypasses RLS: a leaked store-scoped query for another tenant returns zero rows',
    );
  });
});
