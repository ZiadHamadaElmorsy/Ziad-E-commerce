import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService, HealthStatus } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  const healthService = { check: jest.fn() };

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
});
