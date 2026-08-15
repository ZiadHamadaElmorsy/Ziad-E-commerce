import { ConflictError, NotFoundError } from '../../common/errors/domain-exceptions';
import { CheckoutService } from '../../checkout/services/checkout.service';
import { CustomerRepository } from '../../customer/repositories/customer.repository';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { OrderRepository } from '../../orders/repositories/order.repository';
import { PaymentsService } from '../../payments/services/payments.service';
import { StoreSettingsService } from '../../store-settings/services/store-settings.service';
import { StorefrontStoreResolver } from '../../storefront/services/storefront-store-resolver';
import { WhatsAppOrderRequestDto } from '../dto/whatsapp-order-request.dto';
import { WhatsappService } from './whatsapp.service';

describe('WhatsappService (Phase 22)', () => {
  let storeResolver: { resolve: jest.Mock };
  let settings: { readWhatsAppSettings: jest.Mock };
  let checkoutService: { createCheckout: jest.Mock };
  let orders: {
    findWithDetails: jest.Mock;
    findWithDetailsTx: jest.Mock;
    transitionChannel: jest.Mock;
  };
  let customers: { findById: jest.Mock };
  let payments: { hasActivePayment: jest.Mock };
  let transaction: { runWithTenant: jest.Mock };
  let service: WhatsappService;

  const request = { headers: { 'x-storefront-slug': 'my-store' } };
  const store = { id: 'store-1', slug: 'my-store', name: 'My Store' };

  const dto: WhatsAppOrderRequestDto = {
    customer: { name: 'Ziad Hamada', phone: '01012345678', email: 'ziad@example.com' },
    shippingAddress: { governorate: 'Cairo', city: 'Cairo', addressLine: 'St 1' },
  };

  const orderRow = {
    id: 'order-1',
    storeId: 'store-1',
    orderNumber: 'ORD-2026-000001',
    channel: 'WHATSAPP',
    status: 'PENDING',
    currency: 'EGP',
    subtotal: 1550n,
    discountTotal: 0n,
    shippingTotal: 100n,
    taxTotal: 0n,
    grandTotal: 1650n,
    customerId: 'customer-1',
    customerEmail: 'ziad@example.com',
    customerPhone: '01012345678',
    shippingAddressSnapshot: { governorate: 'Cairo', city: 'Cairo', addressLine: 'St 1' },
    billingAddressSnapshot: null,
    idempotencyKey: 'key-1',
    items: [
      {
        id: 'oi-1',
        orderId: 'order-1',
        productId: 'product-1',
        variantId: 'variant-1',
        productNameSnapshot: 'Classic T-Shirt',
        variantNameSnapshot: 'Black / Medium',
        skuSnapshot: null,
        unitPrice: 500n,
        quantity: 2,
        lineTotal: 1000n,
        createdAt: new Date('2026-08-15T00:00:00Z'),
      },
      {
        id: 'oi-2',
        orderId: 'order-1',
        productId: 'product-2',
        variantId: 'variant-2',
        productNameSnapshot: 'Cap',
        variantNameSnapshot: 'Cap',
        skuSnapshot: null,
        unitPrice: 550n,
        quantity: 1,
        lineTotal: 550n,
        createdAt: new Date('2026-08-15T00:00:00Z'),
      },
    ],
    reservations: [],
    createdAt: new Date('2026-08-15T00:00:00Z'),
    updatedAt: new Date('2026-08-15T00:00:00Z'),
    confirmedAt: null,
    cancelledAt: null,
  };

  beforeEach(() => {
    storeResolver = { resolve: jest.fn().mockResolvedValue(store) };
    settings = {
      readWhatsAppSettings: jest.fn().mockResolvedValue({
        enabled: true,
        phoneNumber: '201012345678',
        label: null,
      }),
    };
    checkoutService = { createCheckout: jest.fn() };
    orders = {
      findWithDetails: jest.fn(),
      findWithDetailsTx: jest.fn(),
      transitionChannel: jest.fn(),
    };
    customers = { findById: jest.fn().mockResolvedValue(null) };
    payments = { hasActivePayment: jest.fn().mockResolvedValue(false) };
    transaction = { runWithTenant: jest.fn() };
    service = new WhatsappService(
      storeResolver as unknown as StorefrontStoreResolver,
      settings as unknown as StoreSettingsService,
      checkoutService as unknown as CheckoutService,
      orders as unknown as OrderRepository,
      customers as unknown as CustomerRepository,
      payments as unknown as PaymentsService,
      transaction as unknown as TransactionService,
    );
  });

  it('resolves the store server-side and never accepts a client store id', async () => {
    checkoutService.createCheckout.mockResolvedValue({ orderId: 'order-1' });
    orders.findWithDetails.mockResolvedValue(orderRow);
    const result = await service.createWhatsAppOrder({ request, dto, idempotencyKey: 'key-1' });
    expect(storeResolver.resolve).toHaveBeenCalledWith(request);
    expect(result.order.orderNumber).toBe('ORD-2026-000001');
  });

  it('fails closed when WhatsApp is disabled or the number is invalid', async () => {
    settings.readWhatsAppSettings.mockResolvedValue({ enabled: false, phoneNumber: '', label: null });
    await expect(service.createWhatsAppOrder({ request, dto })).rejects.toBeInstanceOf(ConflictError);
  });

  it('creates a real WHATSAPP-channel order through the checkout pipeline', async () => {
    checkoutService.createCheckout.mockResolvedValue({ orderId: 'order-1' });
    orders.findWithDetails.mockResolvedValue(orderRow);

    const result = await service.createWhatsAppOrder({ request, dto, idempotencyKey: 'key-1' });

    expect(checkoutService.createCheckout).toHaveBeenCalledWith(
      dto,
      undefined,
      'key-1',
      'store-1',
      'ACTIVE',
      'WHATSAPP',
    );
    expect(result.whatsappUrl).toMatch(/^https:\/\/wa\.me\/201012345678\?text=/);
    expect(decodeURIComponent(result.whatsappUrl)).toContain('Order: ORD-2026-000001');
    expect(result.order.channel).toBe('WHATSAPP');
  });

  it('reuses an existing WHATSAPP order instead of creating a duplicate (idempotent retry)', async () => {
    orders.findWithDetails.mockResolvedValue(orderRow); // already WHATSAPP channel

    const result = await service.createWhatsAppOrder({
      request,
      dto: { ...dto, orderId: 'order-1' },
      idempotencyKey: 'key-1',
    });

    expect(result.whatsappUrl).toContain('wa.me');
    expect(checkoutService.createCheckout).not.toHaveBeenCalled();
    expect(orders.transitionChannel).not.toHaveBeenCalled();
  });

  it('transitions an existing ONLINE_PAYMENT PENDING order to WHATSAPP (fallback reuse)', async () => {
    orders.findWithDetails
      .mockResolvedValueOnce({ ...orderRow, channel: 'ONLINE_PAYMENT' })
      .mockResolvedValueOnce({ ...orderRow, channel: 'WHATSAPP' });
    transaction.runWithTenant.mockImplementation(async (_storeId, fn) => fn({}));
    orders.transitionChannel.mockResolvedValue({ count: 1 });

    const result = await service.createWhatsAppOrder({
      request,
      dto: { ...dto, orderId: 'order-1' },
      idempotencyKey: 'key-1',
    });

    expect(orders.transitionChannel).toHaveBeenCalledWith(
      expect.anything(),
      'store-1',
      'order-1',
      'ONLINE_PAYMENT',
      'WHATSAPP',
    );
    expect(checkoutService.createCheckout).not.toHaveBeenCalled();
    expect(result.order.orderId).toBe('order-1');
  });

  it('rejects switching an order that has an active online payment', async () => {
    orders.findWithDetails.mockResolvedValue({ ...orderRow, channel: 'ONLINE_PAYMENT' });
    payments.hasActivePayment.mockResolvedValue(true);

    await expect(
      service.createWhatsAppOrder({ request, dto: { ...dto, orderId: 'order-1' } }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(orders.transitionChannel).not.toHaveBeenCalled();
  });

  it('fails closed for a foreign/unknown order id', async () => {
    orders.findWithDetails.mockResolvedValue(null);
    await expect(
      service.createWhatsAppOrder({ request, dto: { ...dto, orderId: 'missing' } }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('uses the persisted customer name when available', async () => {
    checkoutService.createCheckout.mockResolvedValue({ orderId: 'order-1' });
    orders.findWithDetails.mockResolvedValue(orderRow);
    customers.findById.mockResolvedValue({
      id: 'customer-1',
      storeId: 'store-1',
      firstName: 'Ziad',
      lastName: 'Hamada',
      email: 'ziad@example.com',
      phone: '01012345678',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.createWhatsAppOrder({ request, dto, idempotencyKey: 'key-1' });
    expect(decodeURIComponent(result.whatsappUrl)).toContain('Ziad Hamada');
  });

  it('builds the Arabic message when lang=ar', async () => {
    checkoutService.createCheckout.mockResolvedValue({ orderId: 'order-1' });
    orders.findWithDetails.mockResolvedValue(orderRow);

    const result = await service.createWhatsAppOrder({
      request,
      dto: { ...dto, lang: 'ar' },
      idempotencyKey: 'key-1',
    });
    expect(decodeURIComponent(result.whatsappUrl)).toContain('مرحبًا، أود تقديم طلب.');
  });
});
