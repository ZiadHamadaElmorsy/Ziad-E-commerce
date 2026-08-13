/**
 * BLOCKED database-level CMS tests (PHASE 12).
 *
 * The CMS persistence contract is defined in DATABASE.md §7.21-§7.24/§21/§29:
 *   - pages (DRAFT/PUBLISHED/ARCHIVED; UNIQUE (store_id, slug))
 *   - page_sections (JSONB content; ordered; composite store-scoped FK to
 *     pages with ON DELETE CASCADE)
 *   - navigations (storefront menus; JSONB items)
 *   - theme_configurations (1:1 store; UNIQUE store_id; logo FK media
 *     ON DELETE SET NULL)
 * plus the `tenant_isolation_*` (authenticated) and `public_storefront_select`
 * (anon) RLS policy sets that the initial migration already ships.
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
describe('CMS database tests (BLOCKED — PostgreSQL unavailable)', () => {
  describe.skip('Database / RLS / CMS behavior', () => {
    it.todo('the authenticated role is isolated by RLS: a merchant sees only their store pages');

    it.todo(
      'a merchant cannot read/update/delete another store page_sections, navigations or theme_configurations rows (RLS)',
    );

    it.todo('pages UNIQUE (store_id, slug) rejects a duplicate slug within the same store');

    it.todo('pages slug uniqueness is store-scoped: the same slug is allowed in different stores');

    it.todo(
      'page_sections composite FK (store_id, page_id) rejects a section pointing at another store page',
    );

    it.todo('deleting a page CASCADEs its sections (ON DELETE CASCADE)');

    it.todo('theme_configurations UNIQUE (store_id) enforces the 1:1 store relationship');

    it.todo(
      'theme_configurations.logo_media_id FK rejects a logo media row from another store and SET NULLs on media delete',
    );

    it.todo('page status CHECK/enum rejects an unknown page_status value');

    it.todo(
      'guarded transitions are concurrency-safe: two parallel DRAFT->PUBLISHED updates produce exactly one transition',
    );

    it.todo('navigation/theme rows are replaceable current-state config (no history required)');

    it.todo('draft pages are physically deletable while published/archived pages are retained');

    it.todo(
      'the anon role can read only PUBLISHED pages + their sections (public storefront policy)',
    );

    it.todo(
      'the anon role can read navigation and theme_configurations only for the resolved store',
    );

    it.todo(
      'the authenticated role cannot write outside its store even with a forged store_id (RLS WITH CHECK)',
    );
  });
});
