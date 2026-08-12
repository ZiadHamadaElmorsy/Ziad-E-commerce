import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

describe('App (e2e)', () => {
  let app: INestApplication;

  const prismaServiceStub = {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  };

  beforeAll(async () => {
    // NODE_ENV and DATABASE_URL are set in ./env.e2e.ts (via jest setupFiles)
    // so they are present before AppModule is imported.

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaServiceStub)
      .compile();

    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /api/v1/health returns 200 with service status', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('ziad-api');
    expect(res.body.checks.database).toBe('up');
  });

  it('GET /api/v1/health exposes a valid timestamp', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(new Date(res.body.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('unknown routes return the API error envelope without leaking internals', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);

    expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
    expect(res.body.error.message).toBeDefined();
    expect(res.text).not.toContain('at ');
    expect(res.text).not.toContain('DATABASE_URL');
  });
});
