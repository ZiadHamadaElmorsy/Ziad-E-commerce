import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextGuard } from './tenant-context.guard';
import {
  DEFAULT_TENANT_RESOLUTION_CACHE_TTL_MS,
  TenantContextService,
} from './tenant-context.service';

/**
 * Global tenant boundary.
 *
 * - TenantContextService resolves Authenticated User -> ACTIVE membership ->
 *   Store (never client-supplied store_id as an authorization source).
 * - TenantContextGuard registers as a global guard right after AuthGuard so
 *   every protected request carries a trusted tenant context.
 */
@Global()
@Module({
  providers: [
    {
      provide: TenantContextService,
      inject: [PrismaService, ConfigService],
      useFactory: (prisma: PrismaService, config: ConfigService) => {
        const ttl = config.get<{ tenantCacheTtlMs?: number }>('performance')?.tenantCacheTtlMs;
        return new TenantContextService(prisma, ttl ?? DEFAULT_TENANT_RESOLUTION_CACHE_TTL_MS);
      },
    },
    { provide: APP_GUARD, useClass: TenantContextGuard },
  ],
  exports: [TenantContextService],
})
export class TenantModule {}
