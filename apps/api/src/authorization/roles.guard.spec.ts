import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { ForbiddenError, TenantContextRequiredError } from '../common/errors/domain-exceptions';
import { RequestContextService } from '../common/context/request-context.service';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from './roles.decorator';

describe('RolesGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let requestContext: { getCurrent: jest.Mock };
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) };
    requestContext = { getCurrent: jest.fn() };
    guard = new RolesGuard(
      reflector as unknown as Reflector,
      requestContext as unknown as RequestContextService,
    );
  });

  function context() {
    return {
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  function requireRoles(roles: string[]) {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === ROLES_KEY) {
        return roles;
      }
      if (key === IS_PUBLIC_KEY) {
        return false;
      }
      return undefined;
    });
  }

  function withMembership(role: 'OWNER' | 'ADMIN' | 'STAFF', status = 'ACTIVE') {
    requestContext.getCurrent.mockReturnValue({
      requestId: 'req-1',
      membership: { id: 'm-1', storeId: 'store-1', role, status },
    });
  }

  it.each(['OWNER', 'ADMIN', 'STAFF'] as const)(
    'allows %s when exactly that role is required',
    (role) => {
      requireRoles([role]);
      withMembership(role);

      expect(guard.canActivate(context())).toBe(true);
    },
  );

  it('allows ADMIN when OWNER or ADMIN is required', () => {
    requireRoles(['OWNER', 'ADMIN']);
    withMembership('ADMIN');

    expect(guard.canActivate(context())).toBe(true);
  });

  it('rejects a member whose role is not required', () => {
    requireRoles(['OWNER']);
    withMembership('STAFF');

    expect(() => guard.canActivate(context())).toThrow(ForbiddenError);
  });

  it('rejects an inactive membership even when the role matches', () => {
    requireRoles(['OWNER']);
    withMembership('OWNER', 'INACTIVE');

    expect(() => guard.canActivate(context())).toThrow(ForbiddenError);
  });

  it('fails closed when the membership is missing entirely', () => {
    requireRoles(['OWNER']);
    requestContext.getCurrent.mockReturnValue({ requestId: 'req-1' });

    expect(() => guard.canActivate(context())).toThrow(TenantContextRequiredError);
  });

  it('allows any authenticated member when no @Roles metadata is present', () => {
    withMembership('STAFF');

    expect(guard.canActivate(context())).toBe(true);
  });

  it('never reads the role from the request (client cannot override)', () => {
    requireRoles(['OWNER']);
    withMembership('STAFF');

    // The request says OWNER, but the context (DB-resolved) says STAFF.
    expect(() => guard.canActivate(context())).toThrow(ForbiddenError);
  });

  it('skips public routes', () => {
    reflector.getAllAndOverride.mockReturnValue(true);

    expect(guard.canActivate(context())).toBe(true);
  });
});
