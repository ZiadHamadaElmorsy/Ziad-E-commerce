import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { SKIP_TENANT_CONTEXT_KEY } from '../common/decorators/skip-tenant-context.decorator';
import { UnauthorizedError } from '../common/errors/domain-exceptions';
import { RequestContextService } from '../common/context/request-context.service';
import { TenantContextService } from './tenant-context.service';

/** Header a client may use to select a store the user is a member of. */
export const STORE_ID_HEADER = 'x-store-id';

/**
 * Global tenant-context guard (runs after AuthGuard).
 *
 * Resolves the trusted tenant (membership + store) for every non-public
 * request and stores it in the request context. The client-supplied store id
 * is used ONLY as a lookup key for the ACTIVE membership — the resolved store
 * always comes from the membership row.
 *
 * Routes annotated with `@SkipTenantContext()` (e.g. store creation, where no
 * membership exists yet) still require authentication but skip tenant
 * resolution — see the decorator for details.
 */
@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantContextService: TenantContextService,
    private readonly requestContext: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.isPublic(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = this.requestContext.getCurrent()?.user;

    // Fail closed: a protected request without an authenticated identity must
    // never reach tenant resolution.
    if (!user) {
      throw new UnauthorizedError('Authentication required.');
    }

    // Platform-level routes (e.g. store creation) explicitly opt out of
    // tenant resolution while remaining authenticated.
    if (this.shouldSkipTenantResolution(context)) {
      return true;
    }

    const candidateStoreId = this.resolveCandidateStoreId(request);
    const tenant = await this.tenantContextService.resolveForUser(
      user.authUserId,
      candidateStoreId,
    );
    this.requestContext.setTenant(tenant);

    return true;
  }

  private isPublic(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false
    );
  }

  private shouldSkipTenantResolution(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(SKIP_TENANT_CONTEXT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false
    );
  }

  private resolveCandidateStoreId(request: Request): string | undefined {
    const header = request.headers[STORE_ID_HEADER];
    if (typeof header === 'string' && header.trim().length > 0) {
      return header.trim();
    }
    const routeParam = request.params?.['storeId'];
    if (typeof routeParam === 'string' && routeParam.trim().length > 0) {
      return routeParam.trim();
    }
    return undefined;
  }
}
