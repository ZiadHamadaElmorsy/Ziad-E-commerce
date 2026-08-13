/**
 * BLOCKED database-level Media tests (PHASE 13).
 *
 * The Media persistence contract is defined in DATABASE.md §7.25/§7.26/§9/§12/
 * §22/§25/§29 and shipped by the initial migration:
 *   - media (storage_path; media_type IMAGE/VIDEO/FILE; mime_type; size_bytes
 *     with CHECK >= 0; alt_text; UNIQUE (store_id, id) composite-FK target)
 *   - product_media (composite store-scoped FK to media; media_id FK
 *     ON DELETE RESTRICT; UNIQUE (product_id, media_id))
 *   - theme_configurations.logo_media_id FK media ON DELETE SET NULL
 *   - media.store_id FK stores ON DELETE RESTRICT
 *   - `tenant_isolation_*` (authenticated) and `public_storefront_select`
 *     (anon) RLS policy sets on media + product_media
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
describe('Media database tests (BLOCKED — PostgreSQL unavailable)', () => {
  describe.skip('Database / RLS / Media behavior', () => {
    it.todo(
      'the authenticated role is isolated by RLS: a merchant sees only their store media rows',
    );

    it.todo('a merchant cannot read/update/delete another store media or product_media rows (RLS)');

    it.todo(
      'the authenticated role cannot insert a media row with a forged store_id (RLS WITH CHECK)',
    );

    it.todo('media UNIQUE (store_id, id) backs the composite store-scoped FK target');

    it.todo(
      'product_media composite FK (store_id, media_id) rejects a link to another store media',
    );

    it.todo('product_media media_id FK RESTRICT blocks deleting a referenced media row');

    it.todo(
      'theme_configurations.logo_media_id FK SET NULLs the logo when the media row is deleted',
    );

    it.todo('media.store_id FK RESTRICT blocks deleting a Store that still owns media');

    it.todo('CHECK (size_bytes >= 0) rejects a negative size_bytes value');

    it.todo('media_type enum rejects an unknown media_type value');

    it.todo('product_media UNIQUE (product_id, media_id) rejects duplicate image links');

    it.todo(
      'the anon role can read media and product_media only for the resolved store (public storefront policy)',
    );

    it.todo(
      'media deletion is safe under concurrency: a product_media insert racing a media delete is rejected by RESTRICT',
    );

    it.todo(
      'media deletion is idempotent-safe: deleting an already-deleted media id affects zero rows',
    );
  });
});
