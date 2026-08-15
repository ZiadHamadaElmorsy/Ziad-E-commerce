/**
 * Media storage provider abstraction (docs/DOMAIN-MODEL.md §15.1,
 * docs/DATABASE.md §7.25/§22.2 — binary content lives in Supabase Storage;
 * PostgreSQL stores metadata and references only).
 *
 * Application code depends on this interface, NEVER on Supabase SDK/HTTP
 * internals. The concrete provider is bound via dependency injection
 * (MediaModule) — mirroring the AuthProvider / Paymob provider conventions —
 * keeping the boundary replaceable and unit-testable.
 */
export abstract class StorageProvider {
  /** Stores an object at `key` (tenant-scoped) with the given content type. */
  abstract uploadObject(key: string, data: Buffer, contentType: string): Promise<void>;

  /** Removes the object at `key`. Must treat an already-absent object as success. */
  abstract deleteObject(key: string): Promise<void>;

  /**
   * Retrieves the binary object at `key`. Used by the PUBLIC storefront media
   * proxy (GET /api/v1/storefront/media/:mediaId/content): the caller resolves
   * the media row server-side (store-scoped) BEFORE this is ever called, so a
   * cross-tenant key can never be requested. MUST throw a safe DomainError on
   * failure (never leak credentials or internals).
   */
  abstract downloadObject(key: string): Promise<Buffer>;
}
