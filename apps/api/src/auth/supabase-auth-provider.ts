import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SupabaseConfig } from '../config/configuration';
import { UnauthorizedError } from '../common/errors/domain-exceptions';
import type { AuthenticatedUser } from './authenticated-user';
import { AuthProvider } from './auth-provider';

/**
 * Supabase Auth provider.
 *
 * Verifies the access token against the Supabase Auth REST endpoint
 * (`GET {SUPABASE_URL}/auth/v1/user`) using the project's ANON key. This is
 * real server-side verification delegated to Supabase — no local JWT parsing,
 * no secret keys involved, and nothing is faked.
 *
 * PERFORMANCE (Phase 25 — production audit):
 * Every authenticated request performs this Supabase round-trip BEFORE the
 * tenant resolution and the actual query, which made every API request pay a
 * full cross-region HTTP hop (~250-500ms measured). Successful verifications
 * are therefore memoized in a small in-memory TTL cache (default 60s) keyed by
 * the exact bearer token. This is a bounded trade-off:
 *   - Supabase access tokens are valid for ~1 hour, so a 60s cache accepts a
 *     revoked token for at most 60s (≈1.7% of the token lifetime) — the same
 *     class of staleness inherent to stateless JWT verification, which many
 *     production systems accept by design.
 *   - ONLY successful verifications are cached. Failures (401, network errors)
 *     are never cached, so an invalid token can never be memoized.
 *   - The cache is bounded (MAX_CACHE_ENTRIES) and expired entries are swept
 *     on write; memory cannot grow without bound.
 *   - The TTL is configurable (AUTH_VERIFY_CACHE_TTL_MS; 0 disables caching).
 *   - The access token is never logged.
 *
 * SECURITY:
 * - Requires SUPABASE_URL + SUPABASE_ANON_KEY. When either is absent the
 *   provider FAILS CLOSED (UnauthorizedError) — it never falls back to a
 *   "trust anything" mode.
 *
 * STATUS: Supabase credentials are not present in the current environment, so
 * live Supabase verification is NOT operational yet. The boundary is fully
 * implemented and unit-tested with mocks.
 */

/** Default in-memory memoization TTL for a verified token (ms). */
export const DEFAULT_AUTH_VERIFY_CACHE_TTL_MS = 60_000;

/** Hard cap on cached verifications (memory bound; entries are swept on write). */
export const MAX_AUTH_VERIFY_CACHE_ENTRIES = 1_000;

interface CachedVerification {
  user: AuthenticatedUser;
  expiresAt: number;
}

@Injectable()
export class SupabaseAuthProvider implements AuthProvider {
  private readonly logger = new Logger(SupabaseAuthProvider.name);
  private readonly cache = new Map<string, CachedVerification>();
  private readonly ttlMs: number;

  constructor(
    private readonly configService: ConfigService,
    ttlMs: number = DEFAULT_AUTH_VERIFY_CACHE_TTL_MS,
  ) {
    this.ttlMs = Number.isInteger(ttlMs) && (ttlMs as number) >= 0 ? (ttlMs as number) : 0;
  }

  async verifyToken(token: string): Promise<AuthenticatedUser> {
    const cached = this.readCache(token);
    if (cached) {
      return cached;
    }

    const user = await this.verifyWithSupabase(token);

    if (this.ttlMs > 0) {
      this.writeCache(token, user);
    }

    return user;
  }

  /** Test/ops hook — drops every memoized verification. */
  clearCache(): void {
    this.cache.clear();
  }

  private readCache(token: string): AuthenticatedUser | null {
    const entry = this.cache.get(token);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(token);
      return null;
    }
    return entry.user;
  }

  private writeCache(token: string, user: AuthenticatedUser): void {
    if (this.cache.size >= MAX_AUTH_VERIFY_CACHE_ENTRIES) {
      this.sweepExpired();
    }
    if (this.cache.size >= MAX_AUTH_VERIFY_CACHE_ENTRIES) {
      // Still at capacity (nothing expired) — evict the whole cache rather
      // than grow without bound or evict a live session.
      this.cache.clear();
    }
    this.cache.set(token, { user, expiresAt: Date.now() + this.ttlMs });
  }

  private sweepExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
  }

  private async verifyWithSupabase(token: string): Promise<AuthenticatedUser> {
    const supabase = this.configService.get<SupabaseConfig>('supabase') ?? {};
    if (!supabase.url || !supabase.anonKey) {
      this.logger.warn(
        'Supabase authentication is not configured (SUPABASE_URL / SUPABASE_ANON_KEY missing); failing closed.',
      );
      throw new UnauthorizedError('Authentication is not available.');
    }

    let response: Response;
    try {
      response = await fetch(`${supabase.url}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: supabase.anonKey,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Do NOT echo the token; include only the transport-level reason.
      this.logger.warn(`Supabase Auth request failed: ${message}`);
      throw new UnauthorizedError('Authentication could not be verified.');
    }

    if (!response.ok) {
      throw new UnauthorizedError('Invalid or expired authentication token.');
    }

    const payload = (await response.json()) as { id?: string; email?: string };
    if (!payload.id) {
      throw new UnauthorizedError('Invalid authentication token payload.');
    }

    return { authUserId: payload.id, email: payload.email ?? '' };
  }
}
