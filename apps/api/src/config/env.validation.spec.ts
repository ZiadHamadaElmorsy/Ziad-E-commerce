import { validate } from './env.validation';

describe('env validation', () => {
  it('accepts a valid configuration', () => {
    const config = validate({
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      NODE_ENV: 'development',
      PORT: '4000',
    });

    expect(config.DATABASE_URL).toBe('postgresql://user:pass@localhost:5432/db');
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => validate({})).toThrow(/DATABASE_URL/);
  });

  it('rejects an empty DATABASE_URL', () => {
    expect(() => validate({ DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
  });

  it('rejects an invalid PORT', () => {
    expect(() =>
      validate({ DATABASE_URL: 'postgresql://user:pass@localhost:5432/db', PORT: 'not-a-number' }),
    ).toThrow(/PORT/);
  });

  it('rejects an invalid NODE_ENV', () => {
    expect(() =>
      validate({ DATABASE_URL: 'postgresql://user:pass@localhost:5432/db', NODE_ENV: 'staging' }),
    ).toThrow(/NODE_ENV/);
  });

  it('rejects a non-positive RATE_LIMIT_DEFAULT_LIMIT (Phase 21 fail-fast)', () => {
    expect(() =>
      validate({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
        RATE_LIMIT_DEFAULT_LIMIT: '0',
      }),
    ).toThrow(/RATE_LIMIT_DEFAULT_LIMIT/);
  });

  it('rejects a non-numeric RESERVATION_TTL_MS (Phase 21 fail-fast)', () => {
    expect(() =>
      validate({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
        RESERVATION_TTL_MS: 'thirty-minutes',
      }),
    ).toThrow(/RESERVATION_TTL_MS/);
  });

  it('rejects an empty MEDIA_ALLOWED_MIME_TYPES (Phase 21 fail-fast)', () => {
    expect(() =>
      validate({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
        MEDIA_ALLOWED_MIME_TYPES: '   ',
      }),
    ).toThrow(/MEDIA_ALLOWED_MIME_TYPES/);
  });

  it('accepts a valid configuration including Phase 21 vars', () => {
    const config = validate({
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://yourdomain.com,https://www.yourdomain.com',
      RATE_LIMIT_DEFAULT_LIMIT: '120',
      RESERVATION_TTL_MS: '900000',
      MEDIA_ALLOWED_MIME_TYPES: 'image/jpeg,image/png',
    });

    expect(config.RATE_LIMIT_DEFAULT_LIMIT).toBe('120');
    expect(config.RESERVATION_TTL_MS).toBe('900000');
  });

  describe('production CORS hardening (Phase 23)', () => {
    it('rejects production without CORS_ORIGINS', () => {
      expect(() =>
        validate({
          DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
          NODE_ENV: 'production',
        }),
      ).toThrow(/CORS_ORIGINS/);
    });

    it('rejects a wildcard CORS_ORIGINS in production', () => {
      expect(() =>
        validate({
          DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
          NODE_ENV: 'production',
          CORS_ORIGINS: '*',
        }),
      ).toThrow(/wildcard/);
    });

    it('allows an explicit production allowlist', () => {
      expect(() =>
        validate({
          DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
          NODE_ENV: 'production',
          CORS_ORIGINS: 'https://yourdomain.com, https://www.yourdomain.com',
        }),
      ).not.toThrow();
    });
  });
});
