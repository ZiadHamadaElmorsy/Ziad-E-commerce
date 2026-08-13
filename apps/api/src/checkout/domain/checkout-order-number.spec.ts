import { formatOrderNumber, nextOrderNumber } from './checkout-order-number';

describe('checkout-order-number', () => {
  it('formats ORD-<year>-<zero-padded 6-digit sequence>', () => {
    expect(formatOrderNumber(2026, 1)).toBe('ORD-2026-000001');
    expect(formatOrderNumber(2026, 42)).toBe('ORD-2026-000042');
    expect(formatOrderNumber(2027, 1000)).toBe('ORD-2027-001000');
  });

  it('computes the next candidate from the Store-wide order count + 1', async () => {
    const tx = { order: { count: jest.fn().mockResolvedValue(7) } };

    const number = await nextOrderNumber(tx as never, 'store-1', new Date('2026-08-13T00:00:00Z'));

    expect(tx.order.count).toHaveBeenCalledWith({ where: { storeId: 'store-1' } });
    expect(number).toBe('ORD-2026-000008');
  });

  it('scopes the sequence per Store (count query is store-filtered)', async () => {
    const tx = { order: { count: jest.fn().mockResolvedValue(3) } };

    await nextOrderNumber(tx as never, 'store-b', new Date('2026-08-13T00:00:00Z'));

    expect(tx.order.count).toHaveBeenCalledWith({ where: { storeId: 'store-b' } });
  });
});
