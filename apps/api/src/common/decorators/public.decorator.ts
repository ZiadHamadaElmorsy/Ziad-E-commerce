import { SetMetadata } from '@nestjs/common';

/** Metadata key marking a route/controller as reachable without authentication. */
export const IS_PUBLIC_KEY = 'ziad:isPublic';

/**
 * Marks a handler (or whole controller) as public — the global AuthGuard,
 * TenantContextGuard and RolesGuard all skip public routes.
 *
 * Used sparingly for endpoints such as health checks and the public
 * storefront. Everything else fails closed.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
