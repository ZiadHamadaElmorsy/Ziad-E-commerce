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
}
