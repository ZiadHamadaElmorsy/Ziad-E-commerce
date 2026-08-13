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
 * SECURITY:
 * - Requires SUPABASE_URL + SUPABASE_ANON_KEY. When either is absent the
 *   provider FAILS CLOSED (UnauthorizedError) — it never falls back to a
 *   "trust anything" mode.
 * - The access token is never logged.
 *
 * STATUS: Supabase credentials are not present in the current environment, so
 * live Supabase verification is NOT operational yet. The boundary is fully
 * implemented and unit-tested with mocks.
 */
@Injectable()
export class SupabaseAuthProvider implements AuthProvider {
  private readonly logger = new Logger(SupabaseAuthProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async verifyToken(token: string): Promise<AuthenticatedUser> {
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
