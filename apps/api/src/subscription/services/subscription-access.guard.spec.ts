import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { SKIP_TENANT_CONTEXT_KEY } from '../../common/decorators/skip-tenant-context.decorator';
import { ForbiddenError } from '../../common/errors/domain-exceptions';
import { RequestContextService } from '../../common/context/request-context.service';
import { SubscriptionService } from './subscription.service';
import { SubscriptionAccessGuard } from './subscription-access.guard';

describe('SubscriptionAccessGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let requestContext: { getCurrent: jest.Mock };
  let subscriptions: { assertMerchantWriteAllowed: jest.Mock };
  let guard: SubscriptionAccessGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    requestContext = { getCurrent: jest.fn() };
    subscriptions = { assertMerchantWriteAllowed: jest.fn().mockResolvedValue(undefined) };
    guard = new SubscriptionAccessGuard(
      reflector as unknown as Reflector,
      requestContext as unknown as RequestContextService,
      subscriptions as unknown as SubscriptionService,
    );
  });

  function httpContext(method: string) {
    return {
      switchToHttp: () => ({ getRequest: () => ({ method }) }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  function markPublic(isPublic: boolean) {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) {
        return isPublic;
      }
      if (key === SKIP_TENANT_CONTEXT_KEY) {
        return false;
      }
      return undefined;
    });
  }

  function markSkipTenant(skip: boolean) {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) {
        return false;
      }
      if (key === SKIP_TENANT_CONTEXT_KEY) {
        return skip;
      }
      return undefined;
    });
  }

  function withStoreContext(storeId: string | undefined) {
    requestContext.getCurrent.mockReturnValue({ store: storeId ? { id: storeId } : undefined });
  }

  describe('boundaries', () => {
    it('skips @Public routes (the public storefront enforces the overlay in its resolver)', async () => {
      markPublic(true);

      await expect(guard.canActivate(httpContext('POST'))).resolves.toBe(true);
      expect(subscriptions.assertMerchantWriteAllowed).not.toHaveBeenCalled();
    });

    it('skips @SkipTenantContext routes (e.g. store creation — no Store yet)', async () => {
      markSkipTenant(true);

      await expect(guard.canActivate(httpContext('POST'))).resolves.toBe(true);
      expect(subscriptions.assertMerchantWriteAllowed).not.toHaveBeenCalled();
    });

    it('does not evaluate read requests (read-only dashboard)', async () => {
      for (const method of ['GET', 'HEAD', 'OPTIONS']) {
        await expect(guard.canActivate(httpContext(method))).resolves.toBe(true);
      }
      expect(subscriptions.assertMerchantWriteAllowed).not.toHaveBeenCalled();
    });

    it('passes without evaluation when no store is resolved in the context', async () => {
      withStoreContext(undefined);

      await expect(guard.canActivate(httpContext('POST'))).resolves.toBe(true);
      expect(subscriptions.assertMerchantWriteAllowed).not.toHaveBeenCalled();
    });
  });

  describe('merchant write enforcement', () => {
    it('allows writes for a TRIAL/ACTIVE subscription (normal store operation)', async () => {
      withStoreContext('store-1');

      await expect(guard.canActivate(httpContext('POST'))).resolves.toBe(true);
      expect(subscriptions.assertMerchantWriteAllowed).toHaveBeenCalledWith('store-1');
    });

    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
      'blocks %s writes when the subscription is EXPIRED (dashboard read-only)',
      async (method) => {
        withStoreContext('store-1');
        subscriptions.assertMerchantWriteAllowed.mockRejectedValue(
          new ForbiddenError('subscription expired'),
        );

        await expect(guard.canActivate(httpContext(method))).rejects.toBeInstanceOf(ForbiddenError);
      },
    );

    it('never trusts a client-supplied storeId: the store comes from the resolved tenant context', async () => {
      // Even a forged X-Store-Id header cannot influence the guard — the
      // resolved context store is the only source (asserted on the call).
      withStoreContext('store-1');

      const forged = {
        switchToHttp: () => ({
          getRequest: () => ({ method: 'POST', headers: { 'x-store-id': 'store-999' } }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext;

      await guard.canActivate(forged);

      expect(subscriptions.assertMerchantWriteAllowed).toHaveBeenCalledWith('store-1');
    });
  });
});
