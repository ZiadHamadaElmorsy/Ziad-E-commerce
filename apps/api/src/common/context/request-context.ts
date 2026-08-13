import type { AuthenticatedUser } from '../../auth/authenticated-user';
import type { TenantContext } from '../../tenant/tenant-context';

/**
 * The per-request context carried through the full request lifecycle via
 * AsyncLocalStorage (never a global mutable variable).
 *
 * Populated in this order:
 *
 *   RequestContextMiddleware : requestId
 *   AuthGuard                : user
 *   TenantContextGuard       : membership + store
 *   RolesGuard               : (reads role from membership)
 */
export interface RequestContextData {
  requestId: string;
  /** Verified identity (JWT) — set by the authentication boundary. */
  user?: AuthenticatedUser;
  /** Resolved ACTIVE membership — set by the tenant boundary. */
  membership?: TenantContext['membership'];
  /** Resolved Store (derived from membership) — set by the tenant boundary. */
  store?: TenantContext['store'];
}
