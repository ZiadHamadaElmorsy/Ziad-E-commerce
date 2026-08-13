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
}
