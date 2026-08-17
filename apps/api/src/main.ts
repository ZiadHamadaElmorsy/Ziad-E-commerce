import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { setupApp } from './app.setup';

async function bootstrap(): Promise<void> {
  // rawBody: true (Phase 27) — captures the RAW request body for the Bosta
  // delivery webhook so its HMAC signature can be verified over the exact
  // bytes the provider signed (req.rawBody). All other endpoints are
  // unaffected (they consume the parsed JSON body as before).
  const app = await NestFactory.create(AppModule, { rawBody: true });
  setupApp(app);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port', 4000);

  await app.listen(port, '0.0.0.0');
}

void bootstrap();
