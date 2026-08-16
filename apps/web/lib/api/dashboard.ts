import { api } from './client';
import type { DashboardStatsView, Envelope } from './types';

/**
 * Dashboard API (Phase 25 — performance audit).
 *
 * GET /api/v1/dashboard/stats returns EVERY dashboard metric in a single
 * request. The backend computes product counts, category count, order total +
 * recent orders, revenue (SUM aggregate) and recent products with parallel
 * store-scoped queries — replacing the old pattern of six collection requests
 * PLUS a client-side paginated revenue sum loop (up to 50 sequential requests).
 */
export const dashboardApi = {
  getStats: () => api.get<Envelope<DashboardStatsView>>('/dashboard/stats'),
};
