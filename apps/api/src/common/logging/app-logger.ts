import { Injectable, LoggerService } from '@nestjs/common';
import { RequestContextService } from '../context/request-context.service';

type LogLevel = 'log' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal';

/**
 * Structured JSON logger (Phase 28 — F-4 observability).
 *
 * Implements Nest's `LoggerService`, so every `new Logger(...)` call in the
 * application routes through this class once `app.useLogger(...)` is wired in
 * `setupApp`. Each line is a single JSON object on stdout (info) or stderr
 * (error/fatal):
 *
 *   {"ts":"...","level":"warn","msg":"...","context":"TenantContextService",
 *    "requestId":"...","method":"GET","path":"/api/v1/products",
 *    "storeId":"<uuid>"}
 *
 * The requestId/method/path/storeId fields come from the per-request
 * AsyncLocalStorage context (RequestContextService) and give every log line
 * request-level correlation — including webhook → payment → order flows when a
 * requestId is propagated (X-Request-ID). Outside a request (background jobs,
 * bootstrapping) those fields are simply absent.
 *
 * Safe by construction: the message payload is stringified; unknown structures
 * fall back to a safe string. Error stacks are truncated. No tokens, keys or
 * bodies are ever written by this logger itself.
 */
@Injectable()
export class AppLogger implements LoggerService {
  constructor(private readonly requestContext: RequestContextService) {}

  log(message: unknown, context?: string): void {
    this.write('log', message, context);
  }

  error(message: unknown, stackOrContext?: unknown, context?: string): void {
    // Nest invokes `error(message, ...)` with either (message, stack, context)
    // or (message, context). Disambiguate by argument count/shape.
    if (context !== undefined) {
      // (message, stack, context) — the classic error-with-stack form.
      this.write('error', message, context, { stack: stackOrContext });
    } else if (typeof stackOrContext === 'string') {
      // (message, context) — the common two-argument form.
      this.write('error', message, stackOrContext);
    } else {
      // (message) or (message, Error).
      this.write('error', message, undefined, {
        ...(stackOrContext !== undefined ? { stack: stackOrContext } : {}),
      });
    }
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write('verbose', message, context);
  }

  fatal(message: unknown, context?: string): void {
    this.write('fatal', message, context);
  }

  private write(
    level: LogLevel,
    message: unknown,
    context?: string,
    extra: Record<string, unknown> = {},
  ): void {
    const current = this.requestContext.getCurrent();

    const record: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      msg: this.toMessage(message),
    };
    if (context) record.context = context;
    if (current?.requestId) record.requestId = current.requestId;
    if (current?.method) record.method = current.method;
    if (current?.path) record.path = current.path;
    if (current?.store?.id) record.storeId = current.store.id;
    if (extra.stack !== undefined) {
      record.stack = this.toMessage(extra.stack)
        .split('\n')
        .slice(0, 12)
        .join('\n');
    }

    const line = JSON.stringify(record);
    if (level === 'error' || level === 'fatal') {
      process.stderr.write(`${line}\n`);
    } else {
      process.stdout.write(`${line}\n`);
    }
  }

  /** Safely stringifies any log payload without throwing. */
  private toMessage(message: unknown): string {
    if (typeof message === 'string') return message;
    if (message instanceof Error) return message.message;
    try {
      return JSON.stringify(message);
    } catch {
      return String(message);
    }
  }
}
