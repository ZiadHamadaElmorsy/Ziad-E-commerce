import { SetMetadata } from '@nestjs/common';

/** Metadata key marking a route that is authenticated but NOT tenant-scoped. */
export const SKIP_TENANT_CONTEXT_KEY = 'ziad:skipTenantContext';

/**
 * Marks a handler (or whole controller) as reachable WITHOUT a resolved
 * store tenant context, while STILL requiring authentication.
 *
 * The global guard chain is:
 *
 *   AuthGuard (required, unless @Public) -> TenantContextGuard -> RolesGuard
 *
 * `@SkipTenantContext()` only bypasses the *tenant resolution* step of the
 * TenantContextGuard. Authentication still applies and the route still fails
 * closed (401) when no valid identity is present.
 *
 * Used sparingly for platform-level routes that legitimately operate before a
 * membership exists — e.g. `POST /api/v1/stores` (store creation by a user who
 * has no StoreMembership yet). Phase 1 explicitly anticipated this opt-out:
 * "Platform-level (non-store) endpoints may need an explicit opt-out in a
 * later phase."
 *
 * This is NOT @Public(): public routes skip authentication AND tenancy.
 */
export const SkipTenantContext = () => SetMetadata(SKIP_TENANT_CONTEXT_KEY, true);
