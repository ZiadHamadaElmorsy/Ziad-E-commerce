import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

/**
 * Global minimum-authorization boundary.
 *
 * Provides the RolesGuard (registered last, after AuthGuard and
 * TenantContextGuard) and the @Roles(...) decorator. Only the fixed
 * OWNER / ADMIN / STAFF role boundary exists in this phase; granular
 * permissions remain pending until docs/AUTHORIZATION.md is created.
 */
@Global()
@Module({
  providers: [{ provide: APP_GUARD, useClass: RolesGuard }],
})
export class AuthorizationModule {}
