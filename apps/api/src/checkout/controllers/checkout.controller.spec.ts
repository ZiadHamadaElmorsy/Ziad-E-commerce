import 'reflect-metadata';
import { CheckoutRequestDto } from '../dto/checkout-request.dto';
import { CheckoutService } from '../services/checkout.service';
import { CheckoutController, IDEMPOTENCY_KEY_HEADER } from './checkout.controller';

describe('CheckoutController', () => {
  let checkoutService: { createCheckout: jest.Mock };
  let controller: CheckoutController;

  const checkoutView = {
    orderId: 'order-1',
    orderNumber: 'ORD-2026-000001',
    status: 'PENDING',
    currency: 'EGP',
    subtotal: 1000,
    discountTotal: 0,
    shippingTotal: 0,
    taxTotal: 0,
    grandTotal: 1000,
    customerId: 'customer-1',
    customerEmail: 'ahmed@example.com',
    customerPhone: '01000000000',
    items: [],
    reservations: [],
    createdAt: '2026-08-12T00:00:00.000Z',
  };

  beforeEach(() => {
    checkoutService = { createCheckout: jest.fn() };
    controller = new CheckoutController(checkoutService as unknown as CheckoutService);
  });

  function buildDto(): CheckoutRequestDto {
    const dto = new CheckoutRequestDto();
    dto.customer = { name: 'Ahmed Ali', phone: '01000000000', email: 'ahmed@example.com' };
    dto.shippingAddress = { governorate: 'Gharbia', city: 'Tanta', addressLine: 'Street 5' };
    return dto;
  }

  it('POST /checkout delegates guest token + idempotency key + body and wraps the result', async () => {
    checkoutService.createCheckout.mockResolvedValue(checkoutView);
    const dto = buildDto();

    const result = await controller.create('guest-token-1', 'key-1', dto);

    expect(checkoutService.createCheckout).toHaveBeenCalledWith(dto, 'guest-token-1', 'key-1');
    expect(result).toEqual({ data: checkoutView });
  });

  it('normalizes a blank guest token / idempotency key to undefined', async () => {
    checkoutService.createCheckout.mockResolvedValue(checkoutView);
    const dto = buildDto();

    await controller.create('   ', '   ', dto);

    expect(checkoutService.createCheckout).toHaveBeenCalledWith(dto, undefined, undefined);
  });

  it('normalizes trimmed header values', async () => {
    checkoutService.createCheckout.mockResolvedValue(checkoutView);
    const dto = buildDto();

    await controller.create(' guest-token-1 ', ' key-1 ', dto);

    expect(checkoutService.createCheckout).toHaveBeenCalledWith(dto, 'guest-token-1', 'key-1');
  });

  it('passes undefined through when headers are absent', async () => {
    checkoutService.createCheckout.mockResolvedValue(checkoutView);
    const dto = buildDto();

    await controller.create(undefined, undefined, dto);

    expect(checkoutService.createCheckout).toHaveBeenCalledWith(dto, undefined, undefined);
  });

  it('exports the documented header names', () => {
    expect(IDEMPOTENCY_KEY_HEADER).toBe('idempotency-key');
  });
});
