import { ForbiddenError } from '../common/errors/domain-exceptions';
import { RequestContextService } from '../common/context/request-context.service';
import { AuthController } from './auth.controller';

describe('AuthController', () => {
  let requestContext: { getCurrent: jest.Mock };
  let controller: AuthController;

  beforeEach(() => {
    requestContext = { getCurrent: jest.fn() };
    controller = new AuthController(requestContext as unknown as RequestContextService);
  });

  it('returns the trusted identity and tenant from the request context', () => {
    requestContext.getCurrent.mockReturnValue({
      requestId: 'req-1',
      user: { authUserId: 'auth-1', email: 'a@example.com' },
      membership: { id: 'm-1', storeId: 'store-1', role: 'OWNER', status: 'ACTIVE' },
      store: { id: 'store-1', slug: 'my-store', name: 'My Store', status: 'ACTIVE' },
    });

    expect(controller.me()).toEqual({
      data: {
        requestId: 'req-1',
        user: { authUserId: 'auth-1', email: 'a@example.com' },
        membership: { id: 'm-1', storeId: 'store-1', role: 'OWNER', status: 'ACTIVE' },
        store: { id: 'store-1', slug: 'my-store', name: 'My Store', status: 'ACTIVE' },
      },
    });
  });

  it('fails closed when no request context is present', () => {
    requestContext.getCurrent.mockReturnValue(undefined);

    expect(() => controller.me()).toThrow(ForbiddenError);
  });
});
