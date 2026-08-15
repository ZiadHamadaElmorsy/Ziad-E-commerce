import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /** Liveness/readiness probe — intentionally public (no authentication). */
  @Public()
  @Get()
  check() {
    return this.healthService.check();
  }

  /**
   * Liveness (Phase 23) — the process is up; no dependency I/O. Safe to call
   * as frequently as the orchestrator wants and never rate-limited.
   */
  @Public()
  @Get('live')
  live() {
    return this.healthService.live();
  }

  /**
   * Readiness (Phase 23) — returns 503 until the database dependency is
   * reachable so load balancers / orchestrators pull the instance out of
   * rotation during an outage.
   */
  @Public()
  @Get('ready')
  ready() {
    return this.healthService.ready();
  }
}
