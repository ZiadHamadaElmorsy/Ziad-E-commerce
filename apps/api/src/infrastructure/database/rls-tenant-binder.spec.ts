import { Prisma } from '@prisma/client';
import { RlsTenantBinder } from './rls-tenant-binder';

describe('RlsTenantBinder', () => {
  let binder: RlsTenantBinder;
  let tx: { $executeRaw: jest.Mock };

  beforeEach(() => {
    binder = new RlsTenantBinder();
    tx = { $executeRaw: jest.fn().mockResolvedValue(undefined) };
  });

  function capturedSql(mock: jest.Mock): { sql: string; args: unknown[] } {
    const [strings, ...values] = mock.mock.calls[0] as unknown as [TemplateStringsArray];
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

  it('clears the tenant context on reset so the pooled connection is neutral', async () => {
    await binder.reset(tx as unknown as Prisma.TransactionClient);

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const { sql } = capturedSql(tx.$executeRaw);
    expect(sql).toContain("set_config('app.current_store_id'");
  });
});
