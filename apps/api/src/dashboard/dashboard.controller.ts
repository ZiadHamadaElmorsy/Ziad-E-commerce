import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

/**
 * Merchant Dashboard API (Phase 25 — performance audit).
 *
 *   GET /api/v1/dashboard/stats   aggregated dashboard metrics
 *
 * Thin controller: every metric is computed server-side by the service. The
 * route is authenticated + tenant-scoped through the global guard chain (the
 * trusted store comes from the resolved tenant context, never client input).
 */
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('stats')
  async stats() {
    const data = await this.dashboard.getStats();
    return { data };
  }
}
