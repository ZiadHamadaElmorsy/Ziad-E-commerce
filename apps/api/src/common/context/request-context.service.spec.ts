import { RequestContextService } from './request-context.service';

describe('RequestContextService', () => {
  let service: RequestContextService;

  beforeEach(() => {
    service = new RequestContextService();
  });

  it('creates a context with the request ID available', () => {
    service.runWithContext({ requestId: 'req-1' }, () => {
      expect(service.getCurrent()?.requestId).toBe('req-1');
      expect(service.requestId).toBe('req-1');
    });
  });

  it('exposes no context outside a request', () => {
    expect(service.getCurrent()).toBeUndefined();
    expect(service.requestId).toBeUndefined();
  });

  it('keeps user and tenant (store) data available inside the request', () => {
    service.runWithContext({ requestId: 'req-1' }, () => {
      service.setUser({ authUserId: 'auth-1', email: 'a@example.com' });
      service.setTenant({
        membership: {
          id: 'm-1',
          storeId: 'store-1',
          role: 'OWNER',
          status: 'ACTIVE',
        },
        store: { id: 'store-1', slug: 'my-store', name: 'My Store', status: 'ACTIVE' },
      });

      const current = service.getCurrent();
      expect(current?.user?.authUserId).toBe('auth-1');
      expect(current?.membership?.storeId).toBe('store-1');
      expect(current?.store?.id).toBe('store-1');
      expect(current?.membership?.role).toBe('OWNER');
    });
  });

  it('does not leak state across concurrent requests (no cross-request leakage)', async () => {
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const results = await Promise.all([
      service.runWithContext({ requestId: 'req-a' }, async () => {
        await delay(15);
        service.setUser({ authUserId: 'auth-a', email: 'a@example.com' });
        await delay(15);
        return {
          requestId: service.getCurrent()?.requestId,
          userId: service.getCurrent()?.user?.authUserId,
        };
      }),
      service.runWithContext({ requestId: 'req-b' }, async () => {
        await delay(5);
        service.setUser({ authUserId: 'auth-b', email: 'b@example.com' });
        await delay(20);
        return {
          requestId: service.getCurrent()?.requestId,
          userId: service.getCurrent()?.user?.authUserId,
        };
      }),
    ]);

    expect(results).toEqual([
      { requestId: 'req-a', userId: 'auth-a' },
      { requestId: 'req-b', userId: 'auth-b' },
    ]);
  });

  it('fails closed when context updates are attempted outside a request', () => {
    expect(() => service.setUser({ authUserId: 'auth-1', email: 'a@example.com' })).toThrow(
      /no active request context/i,
    );
    expect(() =>
      service.setTenant({
        membership: { id: 'm-1', storeId: 'store-1', role: 'OWNER', status: 'ACTIVE' },
        store: { id: 'store-1', slug: 'my-store', name: 'My Store', status: 'ACTIVE' },
      }),
    ).toThrow(/no active request context/i);
  });
});
