import { generateOrderLookupToken, isValidOrderLookupToken } from './order-lookup-token';

describe('order-lookup-token (Phase 23)', () => {
  describe('generateOrderLookupToken', () => {
    it('produces a 48-char hex token (192 bits of entropy)', () => {
      const token = generateOrderLookupToken();
      expect(token).toMatch(/^[0-9a-f]{48}$/);
    });

    it('is unique per call', () => {
      const a = generateOrderLookupToken();
      const b = generateOrderLookupToken();
      expect(a).not.toBe(b);
    });
  });

  describe('isValidOrderLookupToken', () => {
    const stored = generateOrderLookupToken();

    it('accepts the exact stored token', () => {
      expect(isValidOrderLookupToken(stored, stored)).toBe(true);
    });

    it('rejects a wrong token', () => {
      const other = generateOrderLookupToken();
      expect(isValidOrderLookupToken(other, stored)).toBe(false);
    });

    it('rejects a length mismatch (timing-safe guard)', () => {
      expect(isValidOrderLookupToken('short', stored)).toBe(false);
    });

    it('rejects when there is no stored token (legacy order)', () => {
      expect(isValidOrderLookupToken(stored, null)).toBe(false);
    });

    it('rejects empty/undefined candidates', () => {
      expect(isValidOrderLookupToken('', stored)).toBe(false);
      expect(isValidOrderLookupToken(undefined as unknown as string, stored)).toBe(false);
    });
  });
});
