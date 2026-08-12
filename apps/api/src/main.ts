import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { setupApp } from './app.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  setupApp(app);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port', 4000);

  await app.listen(port, '0.0.0.0');
}

void bootstrap();
