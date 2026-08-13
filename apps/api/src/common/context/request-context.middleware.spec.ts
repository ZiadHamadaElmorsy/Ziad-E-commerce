import type { NextFunction, Request, Response } from 'express';
import { REQUEST_ID_HEADER, MAX_REQUEST_ID_LENGTH } from './request-context.constants';
import { RequestContextMiddleware } from './request-context.middleware';
import { RequestContextService } from './request-context.service';

describe('RequestContextMiddleware', () => {
  let contextService: RequestContextService;
  let middleware: RequestContextMiddleware;
  let req: Request;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    contextService = new RequestContextService();
    middleware = new RequestContextMiddleware(contextService);
    req = { headers: {} } as Request;
    res = { setHeader: jest.fn() } as unknown as Response;
    next = jest.fn();
  });

  it('generates a request ID when the header is absent', () => {
    middleware.use(req, res, next);

    expect(req.requestId).toBeDefined();
    expect(req.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, req.requestId);
    expect(next).toHaveBeenCalled();
  });

  it('propagates a valid client-supplied request ID', () => {
    req.headers[REQUEST_ID_HEADER] = 'req-from-client-123';

    middleware.use(req, res, next);

    expect(req.requestId).toBe('req-from-client-123');
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'req-from-client-123');
  });

  it('generates a fresh ID for an empty client header', () => {
    req.headers[REQUEST_ID_HEADER] = '   ';

    middleware.use(req, res, next);

    expect(req.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(req.requestId).not.toBe('   ');
  });

  it('generates a fresh ID for an oversized client header', () => {
    req.headers[REQUEST_ID_HEADER] = 'x'.repeat(MAX_REQUEST_ID_LENGTH + 1);

    middleware.use(req, res, next);

    expect(req.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('generates a fresh ID for a header containing unsafe characters (log-injection guard)', () => {
    req.headers[REQUEST_ID_HEADER] = 'ok\nInjected: true';

    middleware.use(req, res, next);

    expect(req.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('makes the request ID available inside the request lifecycle', () => {
    let observedId: string | undefined;
    next = jest.fn(() => {
      observedId = contextService.getCurrent()?.requestId;
    });

    req.headers[REQUEST_ID_HEADER] = 'lifecycle-request-1';
    middleware.use(req, res, next);

    expect(observedId).toBe('lifecycle-request-1');
  });

  it('isolates consecutive requests (no leakage through the shared service)', () => {
    const firstId: string[] = [];
    const secondId: string[] = [];

    req.headers[REQUEST_ID_HEADER] = 'first';
    next = jest.fn(() => firstId.push(contextService.getCurrent()!.requestId));
    middleware.use(req, res, next);

    req = { headers: {} } as Request;
    next = jest.fn(() => secondId.push(contextService.getCurrent()!.requestId));
    middleware.use(req, res, next);

    expect(firstId).toEqual(['first']);
    expect(secondId[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(secondId[0]).not.toBe('first');
  });
});
