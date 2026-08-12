import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { validate } from './config/env.validation';
import configuration from './config/configuration';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Prefer the repository-root `.env` (canonical), fall back to a local `.env`.
      envFilePath: [resolve(process.cwd(), '../../.env'), resolve(process.cwd(), '.env')],
      load: [configuration],
      validate,
    }),
    PrismaModule,
    HealthModule,
  ],
})
export class AppModule {}
