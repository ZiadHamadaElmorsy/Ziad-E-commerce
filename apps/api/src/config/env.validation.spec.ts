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
});
