import { storefrontSlugFromHost } from './storefront-host';

describe('storefrontSlugFromHost (Phase 21 host-based storefront resolution)', () => {
  const DOMAIN = 'yourdomain.com';

  it('resolves a storefront subdomain', () => {
    expect(storefrontSlugFromHost('ziad-fashion.yourdomain.com', DOMAIN)).toBe('ziad-fashion');
  });

  it('handles a port on the host', () => {
    expect(storefrontSlugFromHost('ziad-fashion.yourdomain.com:3000', DOMAIN)).toBe(
      'ziad-fashion',
    );
  });

  it('lowercases the host', () => {
    expect(storefrontSlugFromHost('ZIAD-FASHION.YourDomain.COM', DOMAIN)).toBe(
      'ziad-fashion',
    );
  });

  it('rejects the root domain (it is not a storefront)', () => {
    expect(storefrontSlugFromHost('yourdomain.com', DOMAIN)).toBeUndefined();
    expect(storefrontSlugFromHost('www.yourdomain.com', DOMAIN)).toBeUndefined();
  });

  it('rejects a foreign host that does not end with the platform domain', () => {
    expect(storefrontSlugFromHost('evil.com', DOMAIN)).toBeUndefined();
    expect(storefrontSlugFromHost('ziad-fashion.evil.com', DOMAIN)).toBeUndefined();
    expect(storefrontSlugFromHost('yourdomain.com.attacker.net', DOMAIN)).toBeUndefined();
  });

  it('rejects a host that merely contains the platform domain as a suffix of a longer label', () => {
    // `notyourdomain.com` ends with `ourdomain.com` but is NOT a subdomain.
    expect(storefrontSlugFromHost('notyourdomain.com', DOMAIN)).toBeUndefined();
  });

  it('rejects multi-label subdomains (never resolves a.b.yourdomain.com to store a)', () => {
    expect(storefrontSlugFromHost('a.b.yourdomain.com', DOMAIN)).toBeUndefined();
  });

  it('rejects malformed slugs that do not match the store slug pattern', () => {
    expect(storefrontSlugFromHost('-bad.yourdomain.com', DOMAIN)).toBeUndefined();
    expect(storefrontSlugFromHost('bad-.yourdomain.com', DOMAIN)).toBeUndefined();
    expect(storefrontSlugFromHost('has_underscore.yourdomain.com', DOMAIN)).toBeUndefined();
  });

  it('handles localhost and IPv6 safely (never a storefront)', () => {
    expect(storefrontSlugFromHost('localhost:3000', DOMAIN)).toBeUndefined();
    expect(storefrontSlugFromHost('127.0.0.1:3000', DOMAIN)).toBeUndefined();
    expect(storefrontSlugFromHost('[::1]:3000', DOMAIN)).toBeUndefined();
  });

  it('fails closed for missing or malformed hosts', () => {
    expect(storefrontSlugFromHost(undefined, DOMAIN)).toBeUndefined();
    expect(storefrontSlugFromHost('', DOMAIN)).toBeUndefined();
    expect(storefrontSlugFromHost('   ', DOMAIN)).toBeUndefined();
    expect(storefrontSlugFromHost('http://evil.com/x', DOMAIN)).toBeUndefined();
    expect(storefrontSlugFromHost('not a host header!', DOMAIN)).toBeUndefined();
  });

  it('normalizes a platform domain that carries a scheme or port', () => {
    expect(storefrontSlugFromHost('ziad-fashion.yourdomain.com', 'https://yourdomain.com')).toBe(
      'ziad-fashion',
    );
    expect(storefrontSlugFromHost('ziad-fashion.yourdomain.com:443', 'yourdomain.com:443')).toBe(
      'ziad-fashion',
    );
  });

  it('accepts the default platform-domain.com used in development', () => {
    expect(storefrontSlugFromHost('my-store.platform-domain.com', 'platform-domain.com')).toBe(
      'my-store',
    );
  });
});
