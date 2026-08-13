import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { UnauthorizedError } from '../common/errors/domain-exceptions';
import { RequestContextService } from '../common/context/request-context.service';
import { AuthProvider } from './auth-provider';

const BEARER_PATTERN = /^Bearer\s+(\S+)$/i;

/**
 * Global authentication guard.
 *
 * - Public routes (`@Public()`) are skipped.
 * - All other routes MUST carry `Authorization: Bearer <access_token>`.
 * - The token is verified through the AuthProvider abstraction and the
 *   resulting identity is stored in the per-request context.
 *
 * Missing, malformed, invalid or expired tokens all fail with 401. The user
 * identity is NEVER taken from the request body/query/params.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authProvider: AuthProvider,
    private readonly requestContext: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.isPublic(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedError('Authentication required.');
    }

    const user = await this.authProvider.verifyToken(token);
    this.requestContext.setUser(user);

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

  private extractBearerToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (typeof header !== 'string') {
      return undefined;
    }
    const match = BEARER_PATTERN.exec(header.trim());
    return match?.[1];
  }
}
