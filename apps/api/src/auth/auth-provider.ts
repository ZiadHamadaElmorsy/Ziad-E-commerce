import type { AuthenticatedUser } from './authenticated-user';

/**
 * Authentication provider abstraction.
 *
 * Domain/application code depends on this interface, NOT on Supabase SDK
 * internals. The concrete provider is bound via dependency injection
 * (AuthModule), which keeps the boundary replaceable and unit-testable.
 */
export abstract class AuthProvider {
  /**
   * Verifies a raw Bearer access token and returns the authenticated identity.
   *
   * MUST throw UnauthorizedError for missing/invalid/expired tokens and fail
   * closed when the provider cannot verify (e.g. unconfigured).
   */
  abstract verifyToken(token: string): Promise<AuthenticatedUser>;
}
