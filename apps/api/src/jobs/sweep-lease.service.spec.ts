import { PrismaService } from '../prisma/prisma.service';
import { SweepLeaseService } from './sweep-lease.service';

describe('SweepLeaseService', () => {
  let prisma: { $executeRaw: jest.Mock };
  let service: SweepLeaseService;

  beforeEach(() => {
    prisma = { $executeRaw: jest.fn() };
    service = new SweepLeaseService(prisma as unknown as PrismaService);
  });

  it('tryAcquire returns true when the lease insert/update affected one row', async () => {
    prisma.$executeRaw.mockResolvedValue(1);

    const acquired = await service.tryAcquire('job-1', 600_000, 'node-a');

    expect(acquired).toBe(true);
    // Prisma tagged-template call: [stringsArray, ...interpolatedValues]
    const args = prisma.$executeRaw.mock.calls[0];
    expect(args[1]).toBe('job-1');
    expect(args[2]).toBe('node-a');
    expect(args[3]).toBe(600); // ttl seconds
  });

  it('tryAcquire returns false when another node holds a live lease (0 rows affected)', async () => {
    prisma.$executeRaw.mockResolvedValue(0);

    const acquired = await service.tryAcquire('job-1', 600_000, 'node-b');

    expect(acquired).toBe(false);
  });

  it('release deletes only the caller-owner lease row', async () => {
    prisma.$executeRaw.mockResolvedValue(1);

    await service.release('job-1', 'node-a');

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    const args = prisma.$executeRaw.mock.calls[0];
    expect(args[1]).toBe('job-1');
    expect(args[2]).toBe('node-a');
  });
});
