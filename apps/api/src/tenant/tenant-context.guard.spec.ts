import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { SKIP_TENANT_CONTEXT_KEY } from '../common/decorators/skip-tenant-context.decorator';
import {
  ForbiddenError,
  TenantContextRequiredError,
  UnauthorizedError,
} from '../common/errors/domain-exceptions';
import { RequestContextService } from '../common/context/request-context.service';
import { STORE_ID_HEADER, TenantContextGuard } from './tenant-context.guard';
import { TenantContextService } from './tenant-context.service';
import type { TenantContext } from './tenant-context';

describe('TenantContextGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let tenantService: { resolveForUser: jest.Mock };
  let requestContext: { getCurrent: jest.Mock; setTenant: jest.Mock };
  let guard: TenantContextGuard;

  const resolvedTenant: TenantContext = {
    membership: { id: 'm-1', storeId: 'store-1', role: 'OWNER', status: 'ACTIVE' },
    store: { id: 'store-1', slug: 'my-store', name: 'My Store', status: 'ACTIVE' },
  };

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    tenantService = { resolveForUser: jest.fn() };
    requestContext = { getCurrent: jest.fn(), setTenant: jest.fn() };
    guard = new TenantContextGuard(
      reflector as unknown as Reflector,
      tenantService as unknown as TenantContextService,
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

  it('fails closed when the authenticated user is missing', async () => {
    requestContext.getCurrent.mockReturnValue({ requestId: 'req-1' });

    await expect(guard.canActivate(contextWith({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(tenantService.resolveForUser).not.toHaveBeenCalled();
  });

  it('resolves the tenant from the authenticated user and stores it in the context', async () => {
    requestContext.getCurrent.mockReturnValue({
      requestId: 'req-1',
      user: { authUserId: 'auth-1', email: 'a@example.com' },
    });
    tenantService.resolveForUser.mockResolvedValue(resolvedTenant);

    const allowed = await guard.canActivate(contextWith({ headers: {} }));

    expect(allowed).toBe(true);
    expect(tenantService.resolveForUser).toHaveBeenCalledWith('auth-1', undefined);
    expect(requestContext.setTenant).toHaveBeenCalledWith(resolvedTenant);
  });

  it('passes the X-Store-Id header as a candidate lookup key', async () => {
    requestContext.getCurrent.mockReturnValue({
      requestId: 'req-1',
      user: { authUserId: 'auth-1', email: 'a@example.com' },
    });
    tenantService.resolveForUser.mockResolvedValue(resolvedTenant);

    await guard.canActivate(contextWith({ headers: { [STORE_ID_HEADER]: 'store-1' } }));

    expect(tenantService.resolveForUser).toHaveBeenCalledWith('auth-1', 'store-1');
  });

  it('passes the :storeId route parameter as a candidate lookup key', async () => {
    requestContext.getCurrent.mockReturnValue({
      requestId: 'req-1',
      user: { authUserId: 'auth-1', email: 'a@example.com' },
    });
    tenantService.resolveForUser.mockResolvedValue(resolvedTenant);

    await guard.canActivate(contextWith({ headers: {}, params: { storeId: 'store-1' } }));

    expect(tenantService.resolveForUser).toHaveBeenCalledWith('auth-1', 'store-1');
  });

  it('propagates a fail-closed rejection when tenant resolution is impossible', async () => {
    requestContext.getCurrent.mockReturnValue({
      requestId: 'req-1',
      user: { authUserId: 'auth-1', email: 'a@example.com' },
    });
    tenantService.resolveForUser.mockRejectedValue(
      new TenantContextRequiredError('Multiple stores available; a store must be selected.'),
    );

    await expect(guard.canActivate(contextWith({ headers: {} }))).rejects.toBeInstanceOf(
      TenantContextRequiredError,
    );
    expect(requestContext.setTenant).not.toHaveBeenCalled();
  });

  it('resolves the store from the membership, not from a request-body store_id', async () => {
    requestContext.getCurrent.mockReturnValue({
      requestId: 'req-1',
      user: { authUserId: 'auth-1', email: 'a@example.com' },
    });
    tenantService.resolveForUser.mockResolvedValue(resolvedTenant);

    await guard.canActivate(
      contextWith({
        headers: { [STORE_ID_HEADER]: 'store-1' },
        // A forged store_id in the body must be ignored.
        body: { storeId: 'forged-store', role: 'OWNER' },
      }),
    );

    expect(requestContext.setTenant).toHaveBeenCalledWith(resolvedTenant);
    const set = requestContext.setTenant.mock.calls[0][0] as TenantContext;
    expect(set.store.id).toBe('store-1');
    expect(set.membership.role).toBe('OWNER');
  });

  it('rejects a cross-store request through the resolver (Forbidden)', async () => {
    requestContext.getCurrent.mockReturnValue({
      requestId: 'req-1',
      user: { authUserId: 'auth-1', email: 'a@example.com' },
    });
    tenantService.resolveForUser.mockRejectedValue(new ForbiddenError('No access.'));

    await expect(
      guard.canActivate(contextWith({ headers: { [STORE_ID_HEADER]: 'store-999' } })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('skips tenant resolution for @SkipTenantContext routes while still requiring auth', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) =>
      key === SKIP_TENANT_CONTEXT_KEY ? true : false,
    );

    // No authenticated user yet -> still fails closed with 401 (not public).
    requestContext.getCurrent.mockReturnValue({ requestId: 'req-1' });

    await expect(guard.canActivate(contextWith({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(tenantService.resolveForUser).not.toHaveBeenCalled();
  });

  it('allows an authenticated user on a @SkipTenantContext route without tenant resolution', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) =>
      key === SKIP_TENANT_CONTEXT_KEY ? true : false,
    );
    requestContext.getCurrent.mockReturnValue({
      requestId: 'req-1',
      user: { authUserId: 'auth-1', email: 'a@example.com' },
    });

    const allowed = await guard.canActivate(contextWith({ headers: {} }));

    expect(allowed).toBe(true);
    expect(tenantService.resolveForUser).not.toHaveBeenCalled();
    expect(requestContext.setTenant).not.toHaveBeenCalled();
  });

  it('skips public routes entirely', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) =>
      key === IS_PUBLIC_KEY ? true : false,
    );

    const allowed = await guard.canActivate(contextWith({ headers: {} }));

    expect(allowed).toBe(true);
    expect(tenantService.resolveForUser).not.toHaveBeenCalled();
  });
});
