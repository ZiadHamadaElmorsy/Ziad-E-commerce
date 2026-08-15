import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService, HealthStatus } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  const healthService = { check: jest.fn(), live: jest.fn(), ready: jest.fn() };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: healthService,
        },
      ],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('returns the health status from the service', async () => {
    const status: HealthStatus = {
      status: 'ok',
      service: 'ziad-api',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      uptimeSeconds: 1,
      checks: { database: 'up' },
    };
    healthService.check.mockResolvedValue(status);

    await expect(controller.check()).resolves.toEqual(status);
  });

  it('live() delegates to the liveness probe', () => {
    const live = { status: 'ok' as const, service: 'ziad-api', timestamp: '', uptimeSeconds: 1 };
    healthService.live.mockReturnValue(live);

    expect(controller.live()).toEqual(live);
  });

  it('ready() delegates to the readiness probe', async () => {
    const ready = { status: 'ok' as const, service: 'ziad-api', timestamp: '', checks: { database: 'up' as const } };
    healthService.ready.mockResolvedValue(ready);

    await expect(controller.ready()).resolves.toEqual(ready);
  });
});
