import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { RlsTenantBinder } from './rls-tenant-binder';
import { TransactionService } from './transaction.service';

describe('TransactionService', () => {
  let prisma: { $transaction: jest.Mock };
  let binder: { bind: jest.Mock; reset: jest.Mock };
  let service: TransactionService;
  const txClient = { $executeRaw: jest.fn() } as unknown as Prisma.TransactionClient;

  beforeEach(() => {
    prisma = {
      // Interactive-transaction overload: invoke the callback with the tx client.
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          fn(txClient),
        ),
    };
    binder = {
      bind: jest.fn().mockResolvedValue(undefined),
      reset: jest.fn().mockResolvedValue(undefined),
    };
    service = new TransactionService(
      prisma as unknown as PrismaService,
      binder as unknown as RlsTenantBinder,
    );
  });

  it('runs work inside a single interactive transaction and returns the result', async () => {
    const work = jest.fn().mockResolvedValue('done');

    const result = await service.run(work);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(result).toBe('done');
    expect(work).toHaveBeenCalledWith(txClient);
    expect(prisma.$transaction.mock.calls[0][1]).toBeUndefined();
  });

  it('forwards explicit transaction options (isolation level / timeout / maxWait)', async () => {
    await service.run(jest.fn().mockResolvedValue(undefined), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 5000,
      maxWait: 2000,
    });

    expect(prisma.$transaction.mock.calls[0][1]).toEqual({
      isolationLevel: 'Serializable',
      timeout: 5000,
      maxWait: 2000,
    });
  });

  it('passes no options object when none are supplied', async () => {
    await service.run(jest.fn().mockResolvedValue(undefined));

    expect(prisma.$transaction.mock.calls[0][1]).toBeUndefined();
  });

  it('propagates work errors (rollback is handled by Prisma)', async () => {
    const boom = new Error('work failed');

    await expect(service.run(() => Promise.reject(boom))).rejects.toBe(boom);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('binds the tenant store before work and resets it afterwards', async () => {
    const work = jest.fn().mockResolvedValue('ok');

    const result = await service.runWithTenant('store-1', work);

    expect(result).toBe('ok');
    expect(binder.bind).toHaveBeenCalledWith(txClient, 'store-1');
    expect(work).toHaveBeenCalledWith(txClient);
    expect(binder.reset).toHaveBeenCalledWith(txClient);

    // Binding strictly precedes the work; reset strictly follows it.
    const bindOrder = binder.bind.mock.invocationCallOrder[0];
    const workOrder = work.mock.invocationCallOrder[0];
    const resetOrder = binder.reset.mock.invocationCallOrder[0];
    expect(bindOrder).toBeLessThan(workOrder);
    expect(workOrder).toBeLessThan(resetOrder);
  });

  it('always resets the tenant context even when work throws', async () => {
    const boom = new Error('tenant work failed');

    await expect(service.runWithTenant('store-1', () => Promise.reject(boom))).rejects.toBe(boom);
    expect(binder.bind).toHaveBeenCalledWith(txClient, 'store-1');
    expect(binder.reset).toHaveBeenCalledTimes(1);
  });

  it('never masks the original error when the reset fails after work threw (25P02)', async () => {
    // Simulates a failed DB write: the transaction aborts and the tenant
    // reset inside the aborted transaction itself fails (Postgres 25P02).
    const boom = new Error('duplicate sku conflict');
    binder.reset.mockRejectedValue(new Error('current transaction is aborted'));

    await expect(service.runWithTenant('store-1', () => Promise.reject(boom))).rejects.toBe(boom);
    expect(binder.reset).toHaveBeenCalledTimes(1);
  });

  it('fails loud when the reset fails on the success path', async () => {
    binder.reset.mockRejectedValue(new Error('connection lost'));

    await expect(service.runWithTenant('store-1', () => Promise.resolve('ok'))).rejects.toThrow(
      'connection lost',
    );
  });
});
