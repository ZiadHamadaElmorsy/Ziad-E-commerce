import { Controller, Get } from '@nestjs/common';
import { ForbiddenError } from '../common/errors/domain-exceptions';
import { RequestContextService } from '../common/context/request-context.service';

/**
 * Current-user endpoint — protected by default (authentication + tenant).
 *
 * Foundation probe that exposes exactly the trusted identity the request
 * resolved to: correlation ID, authenticated user, and the tenant (store +
 * membership). It returns NO tokens, NO secrets and NO database internals.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly requestContext: RequestContextService) {}

  @Get('me')
  me() {
    const current = this.requestContext.getCurrent();
    if (!current) {
      throw new ForbiddenError('No active request context.');
    }
    return {
      data: {
        requestId: current.requestId,
        user: current.user
          ? { authUserId: current.user.authUserId, email: current.user.email }
          : null,
        store: current.store ?? null,
        membership: current.membership ?? null,
      },
    };
  }
}
