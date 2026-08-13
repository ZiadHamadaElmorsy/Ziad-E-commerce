/**
 * Identity of a verified end user.
 *
 * This is the trust boundary produced by the Authentication boundary
 * (AuthProvider -> JWT verification). It is NEVER derived from client input.
 *
 * `authUserId` is the Supabase Auth subject (`auth.users.id`) — the
 * authoritative external identity claim. The application-level `users.id`
 * row is resolved later by the tenant boundary from this value.
 */
export interface AuthenticatedUser {
  /** Supabase Auth subject (auth.users.id). */
  authUserId: string;
  /** Verified email claim from the identity provider (may be empty). */
  email: string;
}
