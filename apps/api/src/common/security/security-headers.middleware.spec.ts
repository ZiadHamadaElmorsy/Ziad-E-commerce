import type { NextFunction, Request, Response } from 'express';
import { SecurityHeadersMiddleware } from './security-headers.middleware';

describe('SecurityHeadersMiddleware (Phase 21)', () => {
  it('applies the security headers on every response', () => {
    const setHeader = jest.fn();
    const middleware = new SecurityHeadersMiddleware();
    const next = jest.fn();

    middleware.use(
      {} as Request,
      { setHeader } as unknown as Response,
      next as unknown as NextFunction,
    );

    expect(setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    expect(setHeader).toHaveBeenCalledWith(
      'Referrer-Policy',
      'strict-origin-when-cross-origin',
    );
    expect(setHeader).toHaveBeenCalledWith('X-XSS-Protection', '0');
    expect(setHeader).toHaveBeenCalledWith('Permissions-Policy', expect.stringContaining('camera=()'));
    expect(setHeader).not.toHaveBeenCalledWith(
      'Strict-Transport-Security',
      expect.any(String),
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('sends Strict-Transport-Security only when HSTS is enabled (Phase 23)', () => {
    const setHeader = jest.fn();
    const middleware = new SecurityHeadersMiddleware({ hstsEnabled: true });
    const next = jest.fn();

    middleware.use(
      {} as Request,
      { setHeader } as unknown as Response,
      next as unknown as NextFunction,
    );

    expect(setHeader).toHaveBeenCalledWith(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload',
    );
  });
});
