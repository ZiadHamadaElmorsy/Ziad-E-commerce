import { ConfigService } from '@nestjs/config';
import { UnauthorizedError } from '../common/errors/domain-exceptions';
import { SupabaseAuthProvider } from './supabase-auth-provider';

describe('SupabaseAuthProvider', () => {
  let config: { get: jest.Mock };
  let provider: SupabaseAuthProvider;
  const token = 'eyJhbGciOiJIUzI1NiJ9.fake-token';

  beforeEach(() => {
    config = { get: jest.fn() };
    provider = new SupabaseAuthProvider(config as unknown as ConfigService);
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockSupabaseConfig(overrides: Partial<{ url: string; anonKey: string }> = {}) {
    config.get.mockImplementation((key: string) => {
      if (key === 'supabase') {
        return { url: 'https://project.supabase.co', anonKey: 'anon-key', ...overrides };
      }
      return undefined;
    });
  }

  it('fails closed when Supabase is not configured (no fake verification)', async () => {
    config.get.mockReturnValue(undefined);

    await expect(provider.verifyToken(token)).rejects.toBeInstanceOf(UnauthorizedError);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fails closed when only part of the Supabase config is present', async () => {
    mockSupabaseConfig({ anonKey: undefined });

    await expect(provider.verifyToken(token)).rejects.toBeInstanceOf(UnauthorizedError);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('verifies the token against the Supabase Auth user endpoint', async () => {
    mockSupabaseConfig();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'auth-user-1', email: 'owner@example.com' }),
    });

    const user = await provider.verifyToken(token);

    expect(user).toEqual({ authUserId: 'auth-user-1', email: 'owner@example.com' });
    expect(global.fetch).toHaveBeenCalledWith('https://project.supabase.co/auth/v1/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: 'anon-key',
      },
    });
  });

  it('rejects an invalid token returned by Supabase with 401 semantics', async () => {
    mockSupabaseConfig();
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 401 });

    await expect(provider.verifyToken(token)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects an expired token (Supabase 401) with 401 semantics', async () => {
    mockSupabaseConfig();
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 401 });

    await expect(provider.verifyToken(token)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('fails closed when the identity provider is unreachable', async () => {
    mockSupabaseConfig();
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network down'));

    await expect(provider.verifyToken(token)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects a payload without an id claim', async () => {
    mockSupabaseConfig();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ email: 'no-id@example.com' }),
    });

    await expect(provider.verifyToken(token)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('never leaks the access token in error messages', async () => {
    mockSupabaseConfig();
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 401 });

    const error = (await provider.verifyToken(token).catch((e: unknown) => e)) as Error;
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error.message).not.toContain(token);
  });

  describe('verification memoization (Phase 25)', () => {
    it('caches a successful verification so the next identical call skips Supabase', async () => {
      mockSupabaseConfig();
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'auth-user-1', email: 'owner@example.com' }),
      });

      const first = await provider.verifyToken(token);
      const second = await provider.verifyToken(token);

      expect(first).toEqual({ authUserId: 'auth-user-1', email: 'owner@example.com' });
      expect(second).toEqual(first);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('never caches a failed verification (a later valid response must be honored)', async () => {
      mockSupabaseConfig();
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: false, status: 401 })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'auth-user-2', email: 'second@example.com' }),
        });

      await expect(provider.verifyToken(token)).rejects.toBeInstanceOf(UnauthorizedError);
      const user = await provider.verifyToken(token);

      expect(user.authUserId).toBe('auth-user-2');
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('expires cached verifications after the TTL', async () => {
      jest.useFakeTimers();
      try {
        mockSupabaseConfig();
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: async () => ({ id: 'auth-user-1', email: 'owner@example.com' }),
        });
        const ttlProvider = new SupabaseAuthProvider(
          config as unknown as ConfigService,
          60_000,
        );

        await ttlProvider.verifyToken(token);
        expect(global.fetch).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(60_001);
        await ttlProvider.verifyToken(token);
        expect(global.fetch).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });

    it('does not cache when the TTL is 0 (caching disabled)', async () => {
      mockSupabaseConfig();
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'auth-user-1', email: 'owner@example.com' }),
      });
      const noCacheProvider = new SupabaseAuthProvider(config as unknown as ConfigService, 0);

      await noCacheProvider.verifyToken(token);
      await noCacheProvider.verifyToken(token);

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('clearCache drops memoized verifications', async () => {
      mockSupabaseConfig();
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'auth-user-1', email: 'owner@example.com' }),
      });

      await provider.verifyToken(token);
      provider.clearCache();
      await provider.verifyToken(token);

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
