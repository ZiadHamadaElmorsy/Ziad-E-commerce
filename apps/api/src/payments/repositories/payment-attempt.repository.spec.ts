import { PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentAttemptRepository } from './payment-attempt.repository';

describe('PaymentAttemptRepository', () => {
  let prisma: {
    paymentAttempt: { create: jest.Mock; findFirst: jest.Mock; updateMany: jest.Mock };
  };
  let repository: PaymentAttemptRepository;

  const tx = { paymentAttempt: { create: jest.fn(), updateMany: jest.fn() } };

  const attemptRow = {
    id: 'attempt-1',
    paymentId: 'payment-1',
    status: PaymentStatus.PENDING,
    providerReference: null,
    idempotencyKey: 'key-1',
    amount: 1000n,
    currency: 'EGP',
    failureCode: null,
    failureMessage: null,
    initiatedAt: null,
    completedAt: null,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  beforeEach(() => {
    prisma = {
      paymentAttempt: { create: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
    };
    (tx.paymentAttempt.create as jest.Mock).mockReset();
    (tx.paymentAttempt.updateMany as jest.Mock).mockReset();
    repository = new PaymentAttemptRepository(prisma as unknown as PrismaService);
  });

  it('create writes the PENDING attempt inside the caller transaction', async () => {
    tx.paymentAttempt.create.mockResolvedValue(attemptRow);

    const result = await repository.create(tx as never, {
      paymentId: 'payment-1',
      amount: 1000n,
      currency: 'EGP',
      idempotencyKey: 'key-1',
    });

    expect(tx.paymentAttempt.create).toHaveBeenCalledWith({
      data: {
        paymentId: 'payment-1',
        amount: 1000n,
        currency: 'EGP',
        idempotencyKey: 'key-1',
      },
    });
    expect(result).toBe(attemptRow);
  });

  it('findLatestForPayment returns the most recent attempt of the payment', async () => {
    prisma.paymentAttempt.findFirst.mockResolvedValue(attemptRow);

    const result = await repository.findLatestForPayment('payment-1');

    expect(prisma.paymentAttempt.findFirst).toHaveBeenCalledWith({
      where: { paymentId: 'payment-1' },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toBe(attemptRow);
  });

  it('transitionStatus is a guarded conditional UPDATE scoped to the payment', async () => {
    tx.paymentAttempt.updateMany.mockResolvedValue({ count: 1 });

    const result = await repository.transitionStatus(
      tx as never,
      'payment-1',
      'attempt-1',
      PaymentStatus.PENDING,
      PaymentStatus.PROCESSING,
      { providerReference: 'pm-ref', initiatedAt: new Date('2026-08-12T00:00:00Z') },
    );

    expect(tx.paymentAttempt.updateMany).toHaveBeenCalledWith({
      where: { id: 'attempt-1', paymentId: 'payment-1', status: PaymentStatus.PENDING },
      data: {
        status: PaymentStatus.PROCESSING,
        providerReference: 'pm-ref',
        initiatedAt: new Date('2026-08-12T00:00:00Z'),
      },
    });
    expect(result).toEqual({ count: 1 });
  });

  it('transitionStatus writes completed_at and failure info on FAILED', async () => {
    tx.paymentAttempt.updateMany.mockResolvedValue({ count: 1 });

    await repository.transitionStatus(
      tx as never,
      'payment-1',
      'attempt-1',
      PaymentStatus.PROCESSING,
      PaymentStatus.FAILED,
      {
        failureCode: 'INITIATION_FAILED',
        failureMessage: 'Payment initiation failed.',
        completedAt: new Date('2026-08-12T00:00:00Z'),
      },
    );

    expect(tx.paymentAttempt.updateMany).toHaveBeenCalledWith({
      where: { id: 'attempt-1', paymentId: 'payment-1', status: PaymentStatus.PROCESSING },
      data: {
        status: PaymentStatus.FAILED,
        failureCode: 'INITIATION_FAILED',
        failureMessage: 'Payment initiation failed.',
        completedAt: new Date('2026-08-12T00:00:00Z'),
      },
    });
  });
});
