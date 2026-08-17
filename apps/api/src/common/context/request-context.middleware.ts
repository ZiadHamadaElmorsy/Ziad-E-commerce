import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import {
  MAX_REQUEST_ID_LENGTH,
  REQUEST_ID_HEADER,
  REQUEST_ID_PATTERN,
} from './request-context.constants';
import type { RequestContextData } from './request-context';
import { RequestContextService } from './request-context.service';

/**
 * Seeds the per-request context and correlation ID.
 *
 * - Reads a client-supplied `X-Request-ID`; preserves it only when valid
 *   (bounded length, safe character set), otherwise generates a UUID.
 * - Echoes the resolved ID back in the `X-Request-ID` response header.
 * - Runs the rest of the request pipeline inside an AsyncLocalStorage scope,
 *   so guards/services/filters observe exactly this request's context and no
 *   state leaks between requests.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly requestContext: RequestContextService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = this.resolveRequestId(req);
    req.requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);

    const context: RequestContextData = {
      requestId,
      method: req.method,
      path: req.originalUrl ?? req.url,
    };
    this.requestContext.runWithContext(context, () => next());
  }

  private resolveRequestId(req: Request): string {
    const header = req.headers[REQUEST_ID_HEADER];
    if (typeof header === 'string') {
      const candidate = header.trim();
      if (
        candidate.length > 0 &&
        candidate.length <= MAX_REQUEST_ID_LENGTH &&
        REQUEST_ID_PATTERN.test(candidate)
      ) {
        return candidate;
      }
    }
    return randomUUID();
  }
}

