import { describe, expect, it } from 'vitest';
import { storefrontSlugForHost } from './host';

describe('storefrontSlugForHost (web storefront host routing)', () => {
  const DOMAIN = 'yourdomain.com';

  it('derives the slug from a storefront subdomain', () => {
    expect(storefrontSlugForHost('ziad-fashion.yourdomain.com', DOMAIN)).toBe('ziad-fashion');
  });

  it('handles a port on the host', () => {
    expect(storefrontSlugForHost('ziad-fashion.yourdomain.com:3000', DOMAIN)).toBe(
      'ziad-fashion',
    );
  });

  it('lowercases the host', () => {
    expect(storefrontSlugForHost('ZIAD-FASHION.YourDomain.COM', DOMAIN)).toBe(
      'ziad-fashion',
    );
  });

  it('rejects the root domain and www alias', () => {
    expect(storefrontSlugForHost('yourdomain.com', DOMAIN)).toBeNull();
    expect(storefrontSlugForHost('www.yourdomain.com', DOMAIN)).toBeNull();
  });

  it('rejects foreign hosts and suffix tricks', () => {
    expect(storefrontSlugForHost('evil.com', DOMAIN)).toBeNull();
    expect(storefrontSlugForHost('ziad-fashion.evil.com', DOMAIN)).toBeNull();
    expect(storefrontSlugForHost('notyourdomain.com', DOMAIN)).toBeNull();
  });

  it('rejects multi-label subdomains and malformed slugs', () => {
    expect(storefrontSlugForHost('a.b.yourdomain.com', DOMAIN)).toBeNull();
    expect(storefrontSlugForHost('-bad.yourdomain.com', DOMAIN)).toBeNull();
  });

  it('rejects localhost and missing hosts', () => {
    expect(storefrontSlugForHost('localhost:3000', DOMAIN)).toBeNull();
    expect(storefrontSlugForHost(null, DOMAIN)).toBeNull();
  });

  it('normalizes a platform domain carrying a scheme or port', () => {
    expect(storefrontSlugForHost('ziad-fashion.yourdomain.com', 'https://yourdomain.com')).toBe(
      'ziad-fashion',
    );
  });
});
