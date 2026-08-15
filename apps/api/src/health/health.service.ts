import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
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

/** Liveness probe body — no dependency checks (deployment orchestration only). */
export interface LivenessStatus {
  status: 'ok';
  service: string;
  timestamp: string;
  uptimeSeconds: number;
}

/** Readiness probe body — the database is the only hard dependency. */
export interface ReadinessStatus {
  status: 'ok';
  service: string;
  timestamp: string;
  checks: {
    database: 'up';
  };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness + basic readiness probe (Phase 21). The database check is
   * reported as a non-fatal check so the service can report "degraded"
   * instead of being pulled out of rotation during a transient outage.
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

  /** Liveness (Phase 23): the process is up and serving — no dependency I/O. */
  live(): LivenessStatus {
    return {
      status: 'ok',
      service: 'ziad-api',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  /**
   * Readiness (Phase 23): the API can serve traffic — the database must be
   * reachable. Throws 503 (ServiceUnavailableException) when the dependency is
   * down so orchestration pulls the instance out of rotation.
   */
  async ready(): Promise<ReadinessStatus> {
    const database = await this.checkDatabase();
    if (database !== 'up') {
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'ziad-api',
        timestamp: new Date().toISOString(),
        checks: { database: 'down' },
      });
    }
    return {
      status: 'ok',
      service: 'ziad-api',
      timestamp: new Date().toISOString(),
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
