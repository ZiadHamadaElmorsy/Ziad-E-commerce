import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MembershipRole, MembershipStatus } from '@prisma/client';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { ForbiddenError, TenantContextRequiredError } from '../common/errors/domain-exceptions';
import { RequestContextService } from '../common/context/request-context.service';
import { ROLES_KEY } from './roles.decorator';

/**
 * Global role guard (runs after AuthGuard + TenantContextGuard).
 *
 * - Public routes (`@Public()`) are skipped.
 * - Routes without `@Roles(...)` metadata allow any authenticated member.
 * - Routes with `@Roles(...)` require the resolved membership role to be one
 *   of the declared roles.
 *
 * The role ALWAYS comes from the ACTIVE membership resolved from the
 * database — never from the client. Missing or inactive memberships fail
 * closed. Only the fixed OWNER / ADMIN / STAFF boundary exists in this phase;
 * granular permissions are pending docs/AUTHORIZATION.md.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly requestContext: RequestContextService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.isPublic(context)) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<MembershipRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const current = this.requestContext.getCurrent();
    const membership = current?.membership;

    // Fail closed: role checks require a resolved tenant context.
    if (!membership) {
      throw new TenantContextRequiredError('A store tenant context is required.');
    }

    if (membership.status !== MembershipStatus.ACTIVE) {
      throw new ForbiddenError('Membership is not active.');
    }

    if (!requiredRoles.includes(membership.role)) {
      throw new ForbiddenError(`This action requires role: ${requiredRoles.join(' or ')}.`);
    }

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
}
