import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { RateLimitMiddleware } from './rate-limit.middleware';
import { RateLimitService } from './rate-limit.service';

/**
 * Rate limiting module (Phase 21 — production hardening).
 *
 * Applies the global {@link RateLimitMiddleware} to every API route. The
 * limiter itself is in-memory and configurable through RATE_LIMIT_* env vars;
 * see docs/IMPLEMENTATION-PHASE21-CRITICAL-PRODUCTION-FIXES.md.
 */
@Module({
  providers: [RateLimitService],
  exports: [RateLimitService],
})
export class RateLimitModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RateLimitMiddleware).forRoutes('*');
  }
}
