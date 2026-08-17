import { AppLogger } from './app-logger';
import { RequestContextService } from '../context/request-context.service';

describe('AppLogger (Phase 28 — F-4 structured logs)', () => {
  let requestContext: { getCurrent: jest.Mock };
  let logger: AppLogger;
  let stdoutWrite: jest.SpyInstance;
  let stderrWrite: jest.SpyInstance;

  beforeEach(() => {
    requestContext = { getCurrent: jest.fn() };
    logger = new AppLogger(requestContext as unknown as RequestContextService);
    stdoutWrite = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrWrite = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutWrite.mockRestore();
    stderrWrite.mockRestore();
  });

  it('writes a single JSON line with the request correlation fields', () => {
    requestContext.getCurrent.mockReturnValue({
      requestId: 'req-123',
      method: 'GET',
      path: '/api/v1/products',
      store: { id: 'store-1', slug: 's', name: 'S', status: 'ACTIVE' },
    });

    logger.log('hello', 'ProductsService');

    const line = stdoutWrite.mock.calls[0][0] as string;
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed.ts).toEqual(expect.any(String));
    expect(parsed.level).toBe('log');
    expect(parsed.msg).toBe('hello');
    expect(parsed.context).toBe('ProductsService');
    expect(parsed.requestId).toBe('req-123');
    expect(parsed.method).toBe('GET');
    expect(parsed.path).toBe('/api/v1/products');
    expect(parsed.storeId).toBe('store-1');
  });

  it('omits correlation fields outside a request (background jobs)', () => {
    requestContext.getCurrent.mockReturnValue(undefined);

    logger.log('sweep complete', 'ReservationExpiryJob');

    const parsed = JSON.parse(stdoutWrite.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(parsed.requestId).toBeUndefined();
    expect(parsed.method).toBeUndefined();
  });

  it('writes errors to stderr and truncates stack traces', () => {
    requestContext.getCurrent.mockReturnValue(undefined);
    const stack = new Error('boom').stack ?? 'boom';

    logger.error('payment failed', stack, 'PaymobWebhookService');

    const line = stderrWrite.mock.calls[0][0] as string;
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed.level).toBe('error');
    expect(parsed.context).toBe('PaymobWebhookService');
    expect(parsed.stack).toEqual(expect.any(String));
  });

  it('handles the two-argument error form (message, context)', () => {
    requestContext.getCurrent.mockReturnValue(undefined);

    logger.error('initiation failed', 'PaymentsService');

    const parsed = JSON.parse(stderrWrite.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(parsed.level).toBe('error');
    expect(parsed.context).toBe('PaymentsService');
    expect(parsed.stack).toBeUndefined();
  });

  it('never throws on non-stringifiable payloads', () => {
    requestContext.getCurrent.mockReturnValue(undefined);
    const circular: Record<string, unknown> = { self: undefined };
    circular.self = circular;

    expect(() => logger.warn(circular, 'Test')).not.toThrow();
  });
});
