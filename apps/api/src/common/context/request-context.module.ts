import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { RequestContextMiddleware } from './request-context.middleware';
import { RequestContextService } from './request-context.service';

/**
 * Global request-context foundation:
 *
 * - Registers RequestContextMiddleware for every route (it seeds `requestId`
 *   and the AsyncLocalStorage context for the whole request pipeline).
 * - Exposes RequestContextService for guards/services/filters.
 */
@Global()
@Module({
  providers: [RequestContextService],
  exports: [RequestContextService],
})
export class RequestContextModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
