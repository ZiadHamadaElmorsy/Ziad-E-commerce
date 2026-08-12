import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

export const API_PREFIX = 'api/v1';

/**
 * Applies the cross-cutting foundation shared by the runtime bootstrap and the
 * end-to-end tests: global prefix, validation pipeline, error-handling filter,
 * deliberate CORS, and (in non-production / non-test environments) Swagger.
 */
export function setupApp(app: INestApplication): void {
  const configService = app.get(ConfigService);

  app.setGlobalPrefix(API_PREFIX);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter(app.get(HttpAdapterHost)));

  const corsOrigins = (configService.get<string>('corsOrigins') ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  const nodeEnv = configService.get<string>('nodeEnv', 'development');
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
