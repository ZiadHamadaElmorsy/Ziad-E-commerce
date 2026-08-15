import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * Minimal security headers middleware (Phase 21, HSTS added Phase 23).
 *
 * Applies defensive response headers that the audit noted were missing. The
 * API is a JSON backend (no HTML rendering), so a full Content-Security-Policy
 * is not applicable; these headers protect against content-sniffing, framing,
 * referrer leakage and (on HTTPS production) protocol downgrade without a new
 * dependency.
 *
 * `Strict-Transport-Security` is ONLY sent when the deployment is explicitly
 * configured for it (`SECURITY_HSTS_ENABLED=true` with NODE_ENV=production) —
 * HSTS over plain HTTP would permanently break the domain.
 *
 * Registered in `app.setup.ts` so the same headers apply to runtime AND e2e
 * requests.
 */
@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  constructor(private readonly options: { hstsEnabled: boolean } = { hstsEnabled: false }) {}

  use(_req: Request, res: Response, next: NextFunction): void {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Legacy XSS filter header: explicitly disabled (modern browsers removed
    // it; leaving it on can introduce XSS in some engines).
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=()',
    );
    if (this.options.hstsEnabled) {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload',
      );
    }
    next();
  }
}
