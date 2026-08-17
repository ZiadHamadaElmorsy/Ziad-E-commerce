import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppLogger } from '../logging/app-logger';
import { RequestContextMiddleware } from './request-context.middleware';
import { RequestContextService } from './request-context.service';

/**
 * Global request-context foundation:
 *
 * - Registers RequestContextMiddleware for every route (it seeds `requestId`,
 *   `method`/`path` and the AsyncLocalStorage context for the whole request
 *   pipeline).
 * - Exposes RequestContextService for guards/services/filters.
 * - Exposes AppLogger — the structured JSON LoggerService wired via
 *   `app.useLogger(...)` in `setupApp` (Phase 28 — F-4 observability).
 */
@Global()
@Module({
  providers: [RequestContextService, AppLogger],
  exports: [RequestContextService, AppLogger],
})
export class RequestContextModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
