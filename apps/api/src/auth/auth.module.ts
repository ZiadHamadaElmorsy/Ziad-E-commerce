import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthProvider } from './auth-provider';
import {
  DEFAULT_AUTH_VERIFY_CACHE_TTL_MS,
  SupabaseAuthProvider,
} from './supabase-auth-provider';

/**
 * Global authentication boundary.
 *
 * - Binds the AuthProvider abstraction to the Supabase implementation.
 * - Registers AuthGuard as a global guard (public routes opt out via @Public()).
 * - Exposes the AuthProvider token so tests can override it.
 *
 * Domain modules must depend on AuthProvider, never on Supabase internals.
 */
@Global()
@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: AuthProvider,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const ttl = config.get<{ authVerifyCacheTtlMs?: number }>('performance')
          ?.authVerifyCacheTtlMs;
        return new SupabaseAuthProvider(config, ttl ?? DEFAULT_AUTH_VERIFY_CACHE_TTL_MS);
      },
    },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthProvider],
})
export class AuthModule {}
