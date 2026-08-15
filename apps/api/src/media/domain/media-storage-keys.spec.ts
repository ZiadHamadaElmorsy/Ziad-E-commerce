import { assertSafeStorageKey, buildStorageKey, generateMediaId } from './media-storage-keys';

describe('media storage key generation (docs/AI-AGENT-RULES.md §29, roadmap Phase 13)', () => {
  it('builds a tenant-prefixed key {store_id}/{media_id}', () => {
    expect(buildStorageKey('store-1', 'media-1')).toBe('store-1/media-1');
    expect(buildStorageKey('abc-123', 'uuid-456')).toBe('abc-123/uuid-456');
  });

  it('keeps the store prefix on every key (tenant isolation at the object level)', () => {
    const key = buildStorageKey('store-A', 'media-X');
    expect(key.startsWith('store-A/')).toBe(true);
  });

  it('generates a unique RFC 4122 UUID media id', () => {
    const id = generateMediaId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(generateMediaId()).not.toBe(id);
  });

  describe('assertSafeStorageKey (Phase 21 path-traversal guard)', () => {
    it('accepts well-formed tenant-prefixed keys', () => {
      expect(() => assertSafeStorageKey('store-1/media-1')).not.toThrow();
      expect(() => assertSafeStorageKey('a/b/c')).not.toThrow();
    });

    it('rejects traversal sequences and absolute paths', () => {
      expect(() => assertSafeStorageKey('../etc/passwd')).toThrow();
      expect(() => assertSafeStorageKey('store-1/../../secret')).toThrow();
      expect(() => assertSafeStorageKey('/absolute/path')).toThrow();
      expect(() => assertSafeStorageKey('..\\windows\\path')).toThrow();
    });

    it('rejects empty keys and empty path segments', () => {
      expect(() => assertSafeStorageKey('')).toThrow();
      expect(() => assertSafeStorageKey('store-1//media-1')).toThrow();
      expect(() => assertSafeStorageKey('/')).toThrow();
    });
  });
});
