import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface HealthStatus {
  status: 'ok';
  service: string;
  version: string;
  timestamp: string;
  uptimeSeconds: number;
  checks: {
    database: 'up' | 'down';
  };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness + basic readiness probe. The database check is reported as a
   * non-fatal check so the service can report "degraded" instead of being
   * pulled out of rotation during a transient database outage.
   */
  async check(): Promise<HealthStatus> {
    const database = await this.checkDatabase();

    return {
      status: 'ok',
      service: 'ziad-api',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      checks: { database },
    };
  }

  private async checkDatabase(): Promise<'up' | 'down'> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Health check: database unreachable. ${message}`);
      return 'down';
    }
  }
}
