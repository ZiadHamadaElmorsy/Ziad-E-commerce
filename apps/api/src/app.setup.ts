import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AppLogger } from './common/logging/app-logger';
import { SecurityHeadersMiddleware } from './common/security/security-headers.middleware';

export const API_PREFIX = 'api/v1';

/**
 * Applies the cross-cutting foundation shared by the runtime bootstrap and the
 * end-to-end tests: global prefix, validation pipeline, error-handling filter,
 * deliberate CORS, and (in non-production / non-test environments) Swagger.
 */
export function setupApp(app: INestApplication): void {
  const configService = app.get(ConfigService);
  const nodeEnv = configService.get<string>('nodeEnv', 'development');

  app.setGlobalPrefix(API_PREFIX);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter(app.get(HttpAdapterHost)));

  // Phase 28 — F-4: structured JSON logging with per-request correlation
  // (requestId/method/path/storeId from the AsyncLocalStorage context). Every
  // `new Logger(...)` instance in the application routes through AppLogger once
  // installed. Skipped under NODE_ENV=test so suites keep their default output.
  if (nodeEnv !== 'test') {
    app.useLogger(app.get(AppLogger));
  }

  // Phase 21 — defensive security headers on every API response. HSTS is only
  // sent when the deployment explicitly enables it on HTTPS production
  // (Phase 23 — SECURITY_HSTS_ENABLED).
  const securityHeaders = new SecurityHeadersMiddleware({
    hstsEnabled: configService.get<boolean>('security.hstsEnabled') ?? false,
  });
  app.use((req: Request, res: Response, next: NextFunction) =>
    securityHeaders.use(req, res, next),
  );

  // Phase 23 — trust the reverse proxy's forwarding headers so the client IP
  // used by rate limiting is the real client (TRUST_PROXY). Off by default.
  const trustProxy = configService.get<boolean | string>('proxy.trustProxy') ?? false;
  if (trustProxy !== false) {
    // Express-level setting on the underlying HTTP adapter.
    const httpAdapter = app.getHttpAdapter();
    (httpAdapter.getInstance() as { set: (key: string, value: unknown) => unknown }).set(
      'trust proxy',
      trustProxy,
    );
  }

  const corsOrigins = (configService.get<string>('corsOrigins') ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  if (nodeEnv !== 'production' && nodeEnv !== 'test') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Ziad E-commerce API')
      .setDescription('Backend API of the Ziad E-commerce platform (modular monolith).')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }
}
