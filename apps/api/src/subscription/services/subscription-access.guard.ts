import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { SKIP_TENANT_CONTEXT_KEY } from '../../common/decorators/skip-tenant-context.decorator';
import { RequestContextService } from '../../common/context/request-context.service';
import { SubscriptionService } from './subscription.service';

/** HTTP methods treated as writes for the read-only dashboard overlay. */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Global subscription access guard (runs after AuthGuard -> TenantContextGuard
 * -> RolesGuard).
 *
 * Enforces the documented subscription access overlay (docs/DOMAIN-MODEL.md
 * §6.3/§16.1, BR-SUB-003, US-SUB-002) at the authorization boundary, so the
 * rule lives in exactly ONE place and is never duplicated across modules:
 *
 * - When the Store's subscription is EXPIRED, the merchant dashboard becomes
 *   READ-ONLY: every write request (POST/PUT/PATCH/DELETE) is rejected with
 *   403 FORBIDDEN; reads (GET/HEAD/OPTIONS) remain available.
 * - Commerce data is preserved; nothing is deleted or modified by this guard.
 *
 * Guard boundaries (consistent with the existing guards):
 * - `@Public()` routes are skipped (the public storefront enforces the overlay
 *   in its resolver with a read-only evaluation).
 * - `@SkipTenantContext()` routes (e.g. store creation — no Store exists yet)
 *   are skipped.
 * - Reads are never evaluated (read-only dashboard).
 * - A resolved Store without a subscription row is unrestricted, mirroring the
 *   database default `status DEFAULT 'TRIAL'` (docs/DATABASE.md §7.4).
 */
@Injectable()
export class SubscriptionAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly requestContext: RequestContextService,
    private readonly subscriptions: SubscriptionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.isPublic(context)) {
      return true;
    }
    if (this.shouldSkipTenantResolution(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    if (!this.isWriteRequest(request)) {
      return true;
    }

    const storeId = this.requestContext.getCurrent()?.store?.id;
    if (!storeId) {
      // Without a resolved tenant there is nothing to restrict. The
      // TenantContextGuard has already failed closed for missing memberships,
      // so this only guards the @SkipTenantContext path, which is skipped above.
      return true;
    }

    await this.subscriptions.assertMerchantWriteAllowed(storeId);
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

  private isWriteRequest(request: Request): boolean {
    return WRITE_METHODS.has(request.method.toUpperCase());
  }
}
