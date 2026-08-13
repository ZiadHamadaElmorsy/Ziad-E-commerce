import { EventProcessingStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentEventRepository } from './payment-event.repository';

describe('PaymentEventRepository', () => {
  let prisma: {
    paymentEvent: {
      create: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
      findFirst: jest.Mock;
    };
  };
  let repository: PaymentEventRepository;

  const tx = { paymentEvent: { updateMany: jest.fn() } };

  const eventRow = {
    id: 'event-1',
    storeId: null,
    paymentId: null,
    provider: 'paymob',
    providerEventId: 'txn-1',
    eventType: 'transaction',
    payload: { type: 'transaction', obj: { id: 'txn-1' } },
    signatureVerified: true,
    processingStatus: EventProcessingStatus.RECEIVED,
    errorMessage: null,
    processedAt: null,
    createdAt: new Date('2026-08-12T00:00:00Z'),
  };

  beforeEach(() => {
    prisma = {
      paymentEvent: {
        create: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        findFirst: jest.fn(),
      },
    };
    (tx.paymentEvent.updateMany as jest.Mock).mockReset();
    repository = new PaymentEventRepository(prisma as unknown as PrismaService);
  });

  it('create claims the event with NULL store until the payment is resolved', async () => {
    prisma.paymentEvent.create.mockResolvedValue(eventRow);

    const result = await repository.create({
      provider: 'paymob',
      providerEventId: 'txn-1',
      eventType: 'transaction',
      payload: { type: 'transaction' },
      signatureVerified: true,
    });

    expect(prisma.paymentEvent.create).toHaveBeenCalledWith({
      data: {
        storeId: null,
        paymentId: null,
        provider: 'paymob',
        providerEventId: 'txn-1',
        eventType: 'transaction',
        payload: { type: 'transaction' },
        signatureVerified: true,
      },
    });
    expect(result).toBe(eventRow);
  });

  it('findByProviderEventId uses the UNIQUE (provider, provider_event_id) key', async () => {
    prisma.paymentEvent.findUnique.mockResolvedValue(eventRow);

    const result = await repository.findByProviderEventId('paymob', 'txn-1');

    expect(prisma.paymentEvent.findUnique).toHaveBeenCalledWith({
      where: { provider_providerEventId: { provider: 'paymob', providerEventId: 'txn-1' } },
    });
    expect(result).toBe(eventRow);
  });

  it('markProcessedTx resolves the event to its store+payment and marks PROCESSED', async () => {
    tx.paymentEvent.updateMany.mockResolvedValue({ count: 1 });

    const result = await repository.markProcessedTx(tx as never, 'event-1', 'store-1', 'payment-1');

    expect(tx.paymentEvent.updateMany).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      data: {
        storeId: 'store-1',
        paymentId: 'payment-1',
        processingStatus: EventProcessingStatus.PROCESSED,
        processedAt: expect.any(Date),
        errorMessage: null,
      },
    });
    expect(result).toEqual({ count: 1 });
  });

  it('markError keeps the event in the retry scan with a safe message', async () => {
    prisma.paymentEvent.updateMany.mockResolvedValue({ count: 1 });

    const result = await repository.markError('event-1', 'Payment could not be resolved.');

    expect(prisma.paymentEvent.updateMany).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      data: {
        processingStatus: EventProcessingStatus.ERROR,
        errorMessage: 'Payment could not be resolved.',
      },
    });
    expect(result).toEqual({ count: 1 });
  });

  it('findById is store-scoped (merchant visibility only)', async () => {
    prisma.paymentEvent.findFirst.mockResolvedValue(eventRow);

    await repository.findById('store-1', 'event-1');

    expect(prisma.paymentEvent.findFirst).toHaveBeenCalledWith({
      where: { id: 'event-1', storeId: 'store-1' },
    });
  });
});
