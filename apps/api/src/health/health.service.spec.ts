import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;
  let prisma: { $queryRaw: jest.Mock };

  beforeEach(async () => {
    prisma = { $queryRaw: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = moduleRef.get(HealthService);
  });

  it('reports the database as up when it responds', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const result = await service.check();

    expect(result.status).toBe('ok');
    expect(result.checks.database).toBe('up');
    expect(result.service).toBe('ziad-api');
    expect(new Date(result.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('reports the database as down without throwing when it is unreachable', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));

    const result = await service.check();

    expect(result.status).toBe('ok');
    expect(result.checks.database).toBe('down');
  });

  it('live() returns ok without any dependency I/O', () => {
    const result = service.live();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('ziad-api');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('ready() resolves when the database responds', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const result = await service.ready();

    expect(result.status).toBe('ok');
    expect(result.checks.database).toBe('up');
  });

  it('ready() throws 503 when the database is unreachable', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));

    await expect(service.ready()).rejects.toMatchObject({ status: 503 });
  });
});
