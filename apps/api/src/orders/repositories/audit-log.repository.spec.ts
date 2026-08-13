import { AuditLogRepository } from './audit-log.repository';

describe('AuditLogRepository', () => {
  let repository: AuditLogRepository;

  const tx = { auditLog: { create: jest.fn() } };

  beforeEach(() => {
    (tx.auditLog.create as jest.Mock).mockReset();
    repository = new AuditLogRepository();
  });

  it('create writes the audit row inside the caller transaction and returns the id', async () => {
    tx.auditLog.create.mockResolvedValue({ id: 'audit-1' });

    const result = await repository.create(tx as never, {
      storeId: 'store-1',
      userId: 'user-1',
      action: 'order.cancelled',
      entityType: 'order',
      entityId: 'order-1',
      metadata: { orderNumber: 'ORD-2026-000001', from: 'PENDING', to: 'CANCELLED' },
    });

    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        storeId: 'store-1',
        userId: 'user-1',
        action: 'order.cancelled',
        entityType: 'order',
        entityId: 'order-1',
        metadata: { orderNumber: 'ORD-2026-000001', from: 'PENDING', to: 'CANCELLED' },
      },
      select: { id: true },
    });
    expect(result).toEqual({ id: 'audit-1' });
  });

  it('create accepts a null actor (user_id is nullable)', async () => {
    tx.auditLog.create.mockResolvedValue({ id: 'audit-2' });

    await repository.create(tx as never, {
      storeId: 'store-1',
      userId: null,
      action: 'order.status_changed',
      entityType: 'order',
      entityId: 'order-1',
      metadata: { from: 'PENDING', to: 'CONFIRMED' },
    });

    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        storeId: 'store-1',
        userId: null,
        action: 'order.status_changed',
        entityType: 'order',
        entityId: 'order-1',
        metadata: { from: 'PENDING', to: 'CONFIRMED' },
      },
      select: { id: true },
    });
  });
});
