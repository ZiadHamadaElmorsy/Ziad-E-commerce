import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { UnauthorizedError } from '../common/errors/domain-exceptions';
import { RequestContextService } from '../common/context/request-context.service';
import { AuthGuard } from './auth.guard';
import { AuthProvider } from './auth-provider';

describe('AuthGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let authProvider: { verifyToken: jest.Mock };
  let requestContext: { setUser: jest.Mock };
  let guard: AuthGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    authProvider = { verifyToken: jest.fn() };
    requestContext = { setUser: jest.fn() };
    guard = new AuthGuard(
      reflector as unknown as Reflector,
      authProvider as unknown as AuthProvider,
      requestContext as unknown as RequestContextService,
    );
  });

  function contextWith(request: Partial<Request>): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  async function expectUnauthorized(request: Partial<Request>): Promise<void> {
    await expect(guard.canActivate(contextWith(request))).rejects.toBeInstanceOf(UnauthorizedError);
    expect(authProvider.verifyToken).not.toHaveBeenCalled();
  }

  it('rejects a missing token with 401', async () => {
    await expectUnauthorized({ headers: {} });
  });

  it('rejects a malformed Authorization header with 401', async () => {
    await expectUnauthorized({ headers: { authorization: 'Basic abc123' } });
    await expectUnauthorized({ headers: { authorization: 'Bearer' } });
    await expectUnauthorized({ headers: { authorization: 'Bearer   ' } });
    await expectUnauthorized({ headers: { authorization: '' } });
  });

  it('rejects an invalid token (provider rejects) with 401', async () => {
    authProvider.verifyToken.mockRejectedValue(new UnauthorizedError('Invalid token.'));

    await expect(
      guard.canActivate(contextWith({ headers: { authorization: 'Bearer invalid-token' } })),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects an expired token (provider rejects) with 401', async () => {
    authProvider.verifyToken.mockRejectedValue(new UnauthorizedError('Expired token.'));

    await expect(
      guard.canActivate(contextWith({ headers: { authorization: 'Bearer expired-token' } })),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('establishes the authenticated identity for a valid token', async () => {
    authProvider.verifyToken.mockResolvedValue({
      authUserId: 'auth-user-1',
      email: 'owner@example.com',
    });

    const allowed = await guard.canActivate(
      contextWith({ headers: { authorization: 'Bearer valid-token' } }),
    );

    expect(allowed).toBe(true);
    expect(authProvider.verifyToken).toHaveBeenCalledWith('valid-token');
    expect(requestContext.setUser).toHaveBeenCalledWith({
      authUserId: 'auth-user-1',
      email: 'owner@example.com',
    });
  });

  it('never trusts a client-supplied user identity in the request body', async () => {
    authProvider.verifyToken.mockResolvedValue({
      authUserId: 'auth-from-token',
      email: 'token@example.com',
    });

    await guard.canActivate(
      contextWith({
        headers: { authorization: 'Bearer valid-token' },
        body: { userId: 'client-forged-user', role: 'OWNER' },
      }),
    );

    expect(requestContext.setUser).toHaveBeenCalledWith(
      expect.objectContaining({ authUserId: 'auth-from-token' }),
    );
  });

  it('skips public routes without any token', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) =>
      key === IS_PUBLIC_KEY ? true : false,
    );

    const allowed = await guard.canActivate(contextWith({ headers: {} }));

    expect(allowed).toBe(true);
    expect(authProvider.verifyToken).not.toHaveBeenCalled();
  });
});
