import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import type { RateLimitConfig } from '../config/configuration';
import { bucketForPath, EXEMPT_BUCKET, RateLimitBucket } from './rate-limit.constants';
import { RateLimitDecision, RateLimitService } from './rate-limit.service';

/** Client-facing envelope for a 429 response (matches the API error convention). */
interface RateLimitErrorBody {
  error: {
    code: 'TOO_MANY_REQUESTS';
    message: string;
    details: { retryAfterMs: number };
  };
}

/** Maps a bucket to its configured request limit. */
function limitForBucket(config: RateLimitConfig, bucket: RateLimitBucket): number {
  switch (bucket) {
    case 'auth':
      return config.authLimit;
    case 'storefront-read':
      return config.storefrontReadLimit;
    case 'cart':
      return config.cartLimit;
    case 'checkout':
      return config.checkoutLimit;
    case 'payment':
      return config.paymentLimit;
    case 'order-lookup':
      return config.orderLookupLimit;
    case 'media':
      return config.mediaLimit;
    case 'webhook':
      return config.webhookLimit;
    case 'merchant-api':
      return config.merchantApiLimit;
  }
}

/**
 * Global rate limiting middleware (Phase 21).
 *
 * Applied to every API request; each request is classified into a bucket by
 * its path (see rate-limit.constants) and counted per client IP. Clients that
 * exceed the bucket limit receive HTTP 429 with a `Retry-After` header and the
 * standard error envelope.
 *
 * - `GET /health` is exempt so liveness probes never 429.
 * - Limits are env-configurable (RATE_LIMIT_*) and documented in
 *   docs/IMPLEMENTATION-PHASE21-CRITICAL-PRODUCTION-FIXES.md.
 * - The limiter is in-memory (single instance); production scale-out requires
 *   the shared-store upgrade documented in the phase report.
 */
@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  constructor(
    private readonly limiter: RateLimitService,
    private readonly configService: ConfigService,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const config = this.configService.get<RateLimitConfig>('rateLimit');
    if (!config?.enabled) {
      next();
      return;
    }

    const bucket = bucketForPath(req.originalUrl);
    if (bucket === EXEMPT_BUCKET) {
      next();
      return;
    }

    const key = `${this.clientIp(req)}:${bucket}`;
    const limit = limitForBucket(config, bucket);
    const decision: RateLimitDecision = this.limiter.consume(
      key,
      limit,
      config.defaultWindowMs,
    );

    if (!decision.allowed) {
      this.sendRateLimited(res, decision);
      return;
    }

    // Informational headers for well-behaved clients.
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - 1)));
    next();
  }

  private clientIp(req: Request): string {
    // Express `req.ip` respects `trust proxy`; fall back to the socket address.
    const direct = req.ip ?? req.socket.remoteAddress;
    return direct && direct.length > 0 ? direct : 'unknown';
  }

  private sendRateLimited(res: Response, decision: RateLimitDecision): void {
    const retryAfterSeconds = Math.max(1, Math.ceil(decision.retryAfterMs / 1000));
    const body: RateLimitErrorBody = {
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many requests. Please try again later.',
        details: { retryAfterMs: decision.retryAfterMs },
      },
    };
    res.setHeader('Retry-After', String(retryAfterSeconds));
    res.status(429).json(body);
  }
}
