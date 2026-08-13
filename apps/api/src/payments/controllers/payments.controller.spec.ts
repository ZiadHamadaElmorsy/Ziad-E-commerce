import 'reflect-metadata';
import { PaymentStatus } from '@prisma/client';
import { PaymentsService } from '../services/payments.service';
import { PaymentsController } from './payments.controller';

describe('PaymentsController', () => {
  let payments: { createPayment: jest.Mock; getPayment: jest.Mock };
  let controller: PaymentsController;

  const paymentView = {
    id: 'payment-1',
    orderId: 'order-1',
    status: PaymentStatus.PROCESSING,
    provider: 'paymob',
    providerReference: 'pm-order-1',
    amount: 1000,
    currency: 'EGP',
    failureCode: null,
    failureMessage: null,
    createdAt: '2026-08-12T00:00:00.000Z',
    updatedAt: '2026-08-12T00:00:00.000Z',
    attempts: [],
    providerCheckoutUrl: 'https://iframe?token=x',
  };

  beforeEach(() => {
    payments = { createPayment: jest.fn(), getPayment: jest.fn() };
    controller = new PaymentsController(payments as unknown as PaymentsService);
  });

  it('POST /orders/:orderId/payments delegates orderId + normalized Idempotency-Key', async () => {
    payments.createPayment.mockResolvedValue(paymentView);

    const result = await controller.create('order-1', '  key-1  ');

    expect(payments.createPayment).toHaveBeenCalledWith('order-1', 'key-1');
    expect(result).toEqual({ data: paymentView });
  });

  it('POST /orders/:orderId/payments passes undefined when the header is blank', async () => {
    payments.createPayment.mockResolvedValue(paymentView);

    await controller.create('order-1', '   ');

    expect(payments.createPayment).toHaveBeenCalledWith('order-1', undefined);
  });

  it('GET /orders/:orderId/payment delegates the order id', async () => {
    payments.getPayment.mockResolvedValue(paymentView);

    const result = await controller.get('order-1');

    expect(payments.getPayment).toHaveBeenCalledWith('order-1');
    expect(result).toEqual({ data: paymentView });
  });
});
