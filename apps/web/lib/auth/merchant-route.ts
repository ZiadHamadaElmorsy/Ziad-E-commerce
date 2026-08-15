/**
 * Single source of truth for authenticated merchant routing (Phase 18).
 *
 * Every consumer (login page, DashboardGate, onboarding page) uses this to
 * decide where an authenticated merchant belongs:
 *
 *   - store resolved  -> /dashboard
 *   - no store yet    -> /onboarding
 *
 * The store value comes from the resolved AuthContext (resolved through
 * /auth/me or the GET /onboarding/status fallback), so this function never
 * performs network work itself — it only maps the resolved state to a path.
 */
export function merchantHomePath(store: { id?: string } | null): '/dashboard' | '/onboarding' {
  return store ? '/dashboard' : '/onboarding';
}
