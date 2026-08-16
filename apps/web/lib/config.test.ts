import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The config module reads NEXT_PUBLIC_* at import time, so each test reloads
 * it with a fresh module registry and stubbed environment.
 */
describe('emailConfirmationRedirectUrl (environment-aware)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('uses localhost in local development when NEXT_PUBLIC_APP_URL is unset', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', undefined);

    const { appConfig, emailConfirmationRedirectUrl } = await import('./config');

    expect(appConfig.appUrl).toBe('http://localhost:3000');
    expect(emailConfirmationRedirectUrl()).toBe('http://localhost:3000/login');
  });

  it('uses the configured production URL and never localhost in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://ziad-e-commerce-web-sigma.vercel.app');

    const { appConfig, emailConfirmationRedirectUrl } = await import('./config');

    expect(appConfig.appUrl).toBe('https://ziad-e-commerce-web-sigma.vercel.app');
    expect(emailConfirmationRedirectUrl()).toBe(
      'https://ziad-e-commerce-web-sigma.vercel.app/login',
    );
    expect(emailConfirmationRedirectUrl()).not.toContain('localhost');
  });

  it('falls back to the canonical production URL in a production build', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', undefined);

    const { appConfig, PRODUCTION_APP_URL, emailConfirmationRedirectUrl } = await import('./config');

    // A fresh production build is correct even before NEXT_PUBLIC_APP_URL is
    // added to the deployment environment — and it never points at localhost.
    expect(appConfig.appUrl).toBe(PRODUCTION_APP_URL);
    expect(emailConfirmationRedirectUrl()).toBe(`${PRODUCTION_APP_URL}/login`);
    expect(emailConfirmationRedirectUrl()).not.toContain('localhost');
  });
});

describe('supportPhoneHref', () => {
  it('builds a tel: href from a configured dialable number', async () => {
    const { supportPhoneHref } = await import('./config');
    expect(supportPhoneHref('+20 100 000 0000')).toBe('tel:+201000000000');
    expect(supportPhoneHref('201000000000')).toBe('tel:201000000000');
  });

  it('returns null for a placeholder without usable digits (no clickable link)', async () => {
    const { supportPhoneHref } = await import('./config');
    expect(supportPhoneHref('+20XXXXXXXXXX')).toBeNull();
    expect(supportPhoneHref('')).toBeNull();
  });
});
