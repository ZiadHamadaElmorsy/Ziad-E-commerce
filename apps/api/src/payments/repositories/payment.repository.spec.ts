import { PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentRepository } from './payment.repository';

describe('PaymentRepository', () => {
  let prisma: {
    payment: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let repository: PaymentRepository;

  const tx = { payment: { create: jest.fn(), updateMany: jest.fn() } };

  const paymentRow = {
    id: 'payment-1',
    storeId: 'store-1',
    orderId: 'order-1',
    status: PaymentStatus.PENDING,
    provider: 'paymob',
    providerReference: null,
    amount: 1000n,
    currency: 'EGP',
    idempotencyKey: 'key-1',
    failureCode: null,
    failureMessage: null,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  beforeEach(() => {
    prisma = {
      payment: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    (tx.payment.create as jest.Mock).mockReset();
    (tx.payment.updateMany as jest.Mock).mockReset();
    repository = new PaymentRepository(prisma as unknown as PrismaService);
  });

  it('create writes the PENDING payment with the trusted store/provider/amount', async () => {
    tx.payment.create.mockResolvedValue(paymentRow);

    const result = await repository.create(tx as never, {
      storeId: 'store-1',
      orderId: 'order-1',
      provider: 'paymob',
      amount: 1000n,
      currency: 'EGP',
      idempotencyKey: 'key-1',
    });

    expect(tx.payment.create).toHaveBeenCalledWith({
      data: {
        storeId: 'store-1',
        orderId: 'order-1',
        provider: 'paymob',
        amount: 1000n,
        currency: 'EGP',
        idempotencyKey: 'key-1',
      },
    });
    expect(result).toBe(paymentRow);
  });

  it('findById is a store-scoped findFirst (cross-tenant fails closed)', async () => {
    prisma.payment.findFirst.mockResolvedValue(paymentRow);

    const result = await repository.findById('store-1', 'payment-1');

    expect(prisma.payment.findFirst).toHaveBeenCalledWith({
      where: { id: 'payment-1', storeId: 'store-1' },
    });
    expect(result).toBe(paymentRow);
  });

  it('findByGlobalId resolves by payment UUID only (webhook tenant derivation)', async () => {
    prisma.payment.findUnique.mockResolvedValue(paymentRow);

    const result = await repository.findByGlobalId('payment-1');

    expect(prisma.payment.findUnique).toHaveBeenCalledWith({ where: { id: 'payment-1' } });
    expect(result).toBe(paymentRow);
  });

  it('findByIdempotencyKey is scoped to (store_id, idempotency_key)', async () => {
    prisma.payment.findFirst.mockResolvedValue(paymentRow);

    await repository.findByIdempotencyKey('store-1', 'key-1');

    expect(prisma.payment.findFirst).toHaveBeenCalledWith({
      where: { storeId: 'store-1', idempotencyKey: 'key-1' },
    });
  });

  it('findLatestForOrder is the most recent payment of the order (active payment)', async () => {
    prisma.payment.findFirst.mockResolvedValue(paymentRow);

    await repository.findLatestForOrder('store-1', 'order-1');

    expect(prisma.payment.findFirst).toHaveBeenCalledWith({
      where: { storeId: 'store-1', orderId: 'order-1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('findNonFailedForOrder excludes FAILED payments (retry rule, §16.4)', async () => {
    prisma.payment.findFirst.mockResolvedValue(paymentRow);

    await repository.findNonFailedForOrder('store-1', 'order-1');

    expect(prisma.payment.findFirst).toHaveBeenCalledWith({
      where: { storeId: 'store-1', orderId: 'order-1', status: { not: PaymentStatus.FAILED } },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('transitionStatus is a guarded conditional UPDATE (WHERE status = from)', async () => {
    tx.payment.updateMany.mockResolvedValue({ count: 1 });

    const result = await repository.transitionStatus(
      tx as never,
      'store-1',
      'payment-1',
      PaymentStatus.PENDING,
      PaymentStatus.PROCESSING,
      { providerReference: 'pm-ref' },
    );

    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: { id: 'payment-1', storeId: 'store-1', status: PaymentStatus.PENDING },
      data: { status: PaymentStatus.PROCESSING, providerReference: 'pm-ref' },
    });
    expect(result).toEqual({ count: 1 });
  });

  it('transitionStatus writes failure information only when provided', async () => {
    tx.payment.updateMany.mockResolvedValue({ count: 1 });

    await repository.transitionStatus(
      tx as never,
      'store-1',
      'payment-1',
      PaymentStatus.PROCESSING,
      PaymentStatus.FAILED,
      { failureCode: 'INITIATION_FAILED', failureMessage: 'Payment initiation failed.' },
    );

    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: { id: 'payment-1', storeId: 'store-1', status: PaymentStatus.PROCESSING },
      data: {
        status: PaymentStatus.FAILED,
        failureCode: 'INITIATION_FAILED',
        failureMessage: 'Payment initiation failed.',
      },
    });
  });
});
