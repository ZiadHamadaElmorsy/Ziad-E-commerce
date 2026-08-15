import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { RlsTenantBinder } from './rls-tenant-binder';

describe('RlsTenantBinder', () => {
  let binder: RlsTenantBinder;
  let tx: { $executeRaw: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(() => {
    configService = { get: jest.fn().mockReturnValue(undefined) };
    binder = new RlsTenantBinder(configService as unknown as ConfigService);
    tx = { $executeRaw: jest.fn().mockResolvedValue(undefined) };
  });

  function capturedSql(mock: jest.Mock, callIndex = 0): { sql: string; args: unknown[] } {
    const [strings, ...values] = mock.mock.calls[callIndex] as unknown as [TemplateStringsArray];
    return { sql: strings.join('?'), args: values };
  }

  it('binds the store id through app.set_current_store_id', async () => {
    await binder.bind(
      tx as unknown as Prisma.TransactionClient,
      '11111111-1111-1111-1111-111111111111',
    );

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const { sql, args } = capturedSql(tx.$executeRaw);
    expect(sql).toContain('app.set_current_store_id');
    expect(args).toContain('11111111-1111-1111-1111-111111111111');
  });

  it('sets the runtime role before binding when RLS_ENFORCEMENT_ROLE is configured', async () => {
    configService.get.mockReturnValue('ziad_runtime');

    await binder.bind(
      tx as unknown as Prisma.TransactionClient,
      '11111111-1111-1111-1111-111111111111',
    );

    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    const first = capturedSql(tx.$executeRaw, 0);
    expect(first.sql).toContain("set_config('role'");
    expect(first.args).toContain('ziad_runtime');
    const second = capturedSql(tx.$executeRaw, 1);
    expect(second.sql).toContain('app.set_current_store_id');
  });

  it('does not set a role when RLS_ENFORCEMENT_ROLE is empty', async () => {
    configService.get.mockReturnValue('  ');

    await binder.bind(
      tx as unknown as Prisma.TransactionClient,
      '11111111-1111-1111-1111-111111111111',
    );

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('clears the tenant context on reset so the pooled connection is neutral', async () => {
    await binder.reset(tx as unknown as Prisma.TransactionClient);

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const { sql } = capturedSql(tx.$executeRaw);
    expect(sql).toContain("set_config('app.current_store_id'");
  });
});
