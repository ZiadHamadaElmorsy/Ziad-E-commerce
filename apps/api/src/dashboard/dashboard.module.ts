import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { OrdersModule } from '../orders/orders.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/**
 * Dashboard module (Phase 25 — performance audit).
 *
 * Aggregated merchant dashboard metrics (GET /api/v1/dashboard/stats).
 * Reuses the Catalog and Orders repositories so every query is store-scoped
 * through the SAME tenant-safe implementations as the domain modules — no
 * bypassed authorization, no duplicated ownership rules.
 */
@Module({
  imports: [CatalogModule, OrdersModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
