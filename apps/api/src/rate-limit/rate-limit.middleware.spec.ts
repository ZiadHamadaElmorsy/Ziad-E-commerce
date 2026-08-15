import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { RateLimitMiddleware } from './rate-limit.middleware';
import { RateLimitService } from './rate-limit.service';

describe('RateLimitMiddleware', () => {
  let limiter: RateLimitService;
  let configService: { get: jest.Mock };
  let middleware: RateLimitMiddleware;
  let next: jest.Mock;
  let res: {
    setHeader: jest.Mock;
    status: jest.Mock;
    json: jest.Mock;
  };

  const defaultRateLimitConfig = {
    enabled: true,
    defaultWindowMs: 60_000,
    defaultLimit: 300,
    authLimit: 60,
    storefrontReadLimit: 120,
    cartLimit: 60,
    checkoutLimit: 30,
    paymentLimit: 30,
    orderLookupLimit: 60,
    mediaLimit: 300,
    webhookLimit: 120,
    merchantApiLimit: 300,
  };

  beforeEach(() => {
    limiter = new RateLimitService();
    configService = { get: jest.fn().mockReturnValue(defaultRateLimitConfig) };
    middleware = new RateLimitMiddleware(limiter, configService as unknown as ConfigService);
    next = jest.fn();
    res = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  function request(originalUrl: string, ip?: string): Request {
    return {
      originalUrl,
      ip: ip ?? '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as Request;
  }

  it('skips rate limiting entirely when disabled', () => {
    configService.get.mockReturnValue({ ...defaultRateLimitConfig, enabled: false });

    for (let i = 0; i < 1000; i++) {
      middleware.use(
        request('/api/v1/storefront/checkout'),
        res as unknown as Response,
        next as unknown as NextFunction,
      );
    }

    expect(next).toHaveBeenCalledTimes(1000);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('exempts the health endpoint from rate limiting', () => {
    for (let i = 0; i < 1000; i++) {
      middleware.use(
        request('/api/v1/health'),
        res as unknown as Response,
        next as unknown as NextFunction,
      );
    }
    expect(next).toHaveBeenCalledTimes(1000);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('allows requests within the bucket limit and sets limit headers', () => {
    const req = request('/api/v1/storefront/products');
    middleware.use(req, res as unknown as Response, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '120');
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '119');
  });

  it('returns 429 with Retry-After and the error envelope once the limit is exceeded', () => {
    configService.get.mockReturnValue({ ...defaultRateLimitConfig, checkoutLimit: 2 });

    middleware.use(
      request('/api/v1/storefront/checkout'),
      res as unknown as Response,
      next as unknown as NextFunction,
    );
    middleware.use(
      request('/api/v1/storefront/checkout'),
      res as unknown as Response,
      next as unknown as NextFunction,
    );
    middleware.use(
      request('/api/v1/storefront/checkout'),
      res as unknown as Response,
      next as unknown as NextFunction,
    );

    expect(next).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.stringMatching(/^[1-9]/));
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many requests. Please try again later.',
        details: { retryAfterMs: expect.any(Number) },
      },
    });
  });

  it('applies per-bucket limits independently', () => {
    configService.get.mockReturnValue({ ...defaultRateLimitConfig, cartLimit: 1 });

    // Exhaust the cart bucket.
    middleware.use(
      request('/api/v1/storefront/cart/items'),
      res as unknown as Response,
      next as unknown as NextFunction,
    );
    middleware.use(
      request('/api/v1/storefront/cart'),
      res as unknown as Response,
      next as unknown as NextFunction,
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.anything() }));

    // A different bucket (storefront read) is unaffected.
    middleware.use(
      request('/api/v1/storefront/products'),
      res as unknown as Response,
      next as unknown as NextFunction,
    );
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('keys per client IP so one IP cannot exhaust another IP budget', () => {
    configService.get.mockReturnValue({ ...defaultRateLimitConfig, checkoutLimit: 1 });

    middleware.use(
      request('/api/v1/storefront/checkout', '1.1.1.1'),
      res as unknown as Response,
      next as unknown as NextFunction,
    );
    middleware.use(
      request('/api/v1/storefront/checkout', '2.2.2.2'),
      res as unknown as Response,
      next as unknown as NextFunction,
    );

    expect(next).toHaveBeenCalledTimes(2);
    expect(res.json).not.toHaveBeenCalled();
  });
});
