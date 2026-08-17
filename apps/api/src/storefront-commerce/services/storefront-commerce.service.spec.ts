import { NotFoundError } from '../../common/errors/domain-exceptions';
import { StorefrontCommerceService } from './storefront-commerce.service';

/**
 * Unit coverage of PHASE 19 — public storefront commerce service.
 *
 * Verifies the service is a THIN BRIDGE: the Store is resolved server-side by
 * the StorefrontStoreResolver (never client input) and every operation
 * delegates to the EXISTING services/repositories with that resolved store id
 * (Cart, Checkout, Payments, Orders, CMS Theme, CMS Navigation, Media
 * storage). Tenant isolation is tested explicitly: cross-tenant orders/media
 * fail closed with NOT_FOUND.
 */
describe('StorefrontCommerceService', () => {
  let service: StorefrontCommerceService;

  const store = {
    id: 'store-1',
    slug: 'my-store',
    name: 'My Store',
    description: null,
    currency: 'EGP',
    timezone: 'Africa/Cairo',
  };

  const request = { headers: { 'x-storefront-slug': 'my-store' } };

  const storeResolver = { resolve: jest.fn() };
  const storefrontRepository = { findMediaInStore: jest.fn() };
  const carts = {
    getCart: jest.fn(),
    addItem: jest.fn(),
    updateItem: jest.fn(),
    removeItem: jest.fn(),
    clearCart: jest.fn(),
  };
  const checkoutService = { createCheckout: jest.fn() };
  const payments = { createPayment: jest.fn(), getPayment: jest.fn() };
  const orders = { findWithDetails: jest.fn() };
  const themes = { getTheme: jest.fn() };
  const navigations = { getNavigation: jest.fn() };
  const storage = { downloadObject: jest.fn() };
  const settings = { readWhatsAppSettings: jest.fn() };
  const whatsapp = { createWhatsAppOrder: jest.fn() };
  const shipments = { getCustomerTracking: jest.fn() };
  const config = { get: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    storeResolver.resolve.mockResolvedValue(store);
    service = new StorefrontCommerceService(
      storeResolver as never,
      storefrontRepository as never,
      carts as never,
      checkoutService as never,
      payments as never,
      orders as never,
      themes as never,
      navigations as never,
      storage as never,
      settings as never,
      whatsapp as never,
      shipments as never,
      config as never,
    );
  });

  describe('store resolution (trusted, server-side)', () => {
    it('resolves the store from the request (X-Storefront-Slug / Host) on every call', async () => {
      await service.getCart(request as never);
      expect(storeResolver.resolve).toHaveBeenCalledWith(request);
    });

    it('never accepts a client-supplied store id', async () => {
      // The service signature has no store-id parameter anywhere: it is always
      // derived from the trusted resolver.
      await service.getCart(request as never);
      expect(carts.getCart).toHaveBeenCalledWith(undefined, 'store-1');
    });
  });

  describe('cart', () => {
    it('delegates getCart with the resolved store id', async () => {
      carts.getCart.mockResolvedValue({ id: 'cart-1' });
      const result = await service.getCart(request as never, 'guest-token');
      expect(carts.getCart).toHaveBeenCalledWith('guest-token', 'store-1');
      expect(result).toEqual({ id: 'cart-1' });
    });

    it('delegates addCartItem with the dto and the resolved store id', async () => {
      carts.addItem.mockResolvedValue({ id: 'cart-1' });
      const dto = { variantId: 'variant-1', quantity: 2 };
      const result = await service.addCartItem(request as never, 'guest-token', dto);
      expect(carts.addItem).toHaveBeenCalledWith('guest-token', dto, 'store-1');
      expect(result).toEqual({ id: 'cart-1' });
    });

    it('delegates updateCartItem / removeCartItem / clearCart', async () => {
      await service.updateCartItem(request as never, 'g', 'item-1', { quantity: 3 });
      expect(carts.updateItem).toHaveBeenCalledWith('g', 'item-1', { quantity: 3 }, 'store-1');

      await service.removeCartItem(request as never, 'g', 'item-1');
      expect(carts.removeItem).toHaveBeenCalledWith('g', 'item-1', 'store-1');

      await service.clearCart(request as never, 'g');
      expect(carts.clearCart).toHaveBeenCalledWith('g', 'store-1');
    });
  });

  describe('checkout', () => {
    it('delegates checkout with the resolved store id and ACTIVE status (defense in depth)', async () => {
      checkoutService.createCheckout.mockResolvedValue({ orderId: 'order-1' });
      settings.readWhatsAppSettings.mockResolvedValue({
        enabled: false,
        phoneNumber: '',
        label: null,
      });
      config.get.mockReturnValue({ apiKey: 'k', integrationId: 'i', publicKey: 'p' });
      const dto = {
        customer: { name: 'Ahmed', phone: '0100' },
        shippingAddress: { governorate: 'Cairo', city: 'Cairo', addressLine: 'St 1' },
      };
      const result = await service.checkout(request as never, 'guest-token', dto, 'idem-key');
      expect(checkoutService.createCheckout).toHaveBeenCalledWith(
        dto,
        'guest-token',
        'idem-key',
        'store-1',
        'ACTIVE',
        'ONLINE_PAYMENT',
        'ONLINE',
      );
      expect(result).toEqual({ orderId: 'order-1' });
    });

    it('fails closed (no order) when neither Paymob nor WhatsApp is available', async () => {
      settings.readWhatsAppSettings.mockResolvedValue({
        enabled: false,
        phoneNumber: '',
        label: null,
      });
      config.get.mockReturnValue({}); // Paymob unconfigured

      const dto = {
        customer: { name: 'Ahmed', phone: '0100' },
        shippingAddress: { governorate: 'Cairo', city: 'Cairo', addressLine: 'St 1' },
      };
      await expect(service.checkout(request as never, 'g', dto, 'k')).rejects.toThrow(
        'No payment method is available',
      );
      expect(checkoutService.createCheckout).not.toHaveBeenCalled();
    });
  });

  describe('payment', () => {
    it('delegates createPayment with the resolved store id', async () => {
      payments.createPayment.mockResolvedValue({ id: 'payment-1' });
      const result = await service.createPayment(request as never, 'order-1', 'idem', 'https://x/return');
      expect(payments.createPayment).toHaveBeenCalledWith('order-1', 'idem', 'store-1', {
        returnUrl: 'https://x/return',
      });
      expect(result).toEqual({ id: 'payment-1' });
    });

    it('delegates getPayment with the resolved store id', async () => {
      payments.getPayment.mockResolvedValue({ id: 'payment-1', status: 'SUCCEEDED' });
      const result = await service.getPayment(request as never, 'order-1');
      expect(payments.getPayment).toHaveBeenCalledWith('order-1', 'store-1');
      expect(result).toEqual({ id: 'payment-1', status: 'SUCCEEDED' });
    });
  });

  describe('order (confirmation page)', () => {
    const orderRow = {
      id: 'order-1',
      orderNumber: 'ORD-2026-000001',
      channel: 'ONLINE_PAYMENT',
      paymentMethod: 'ONLINE',
      paymentStatus: 'UNPAID',
      status: 'PENDING',
      currency: 'EGP',
      subtotal: 1000n,
      discountTotal: 0n,
      shippingTotal: 0n,
      taxTotal: 0n,
      grandTotal: 1000n,
      customerEmail: 'a@b.com',
      customerPhone: '0100',
      shippingAddressSnapshot: { city: 'Cairo' },
      billingAddressSnapshot: null,
      createdAt: new Date('2026-08-14T00:00:00Z'),
      updatedAt: new Date('2026-08-14T00:00:00Z'),
      confirmedAt: null,
      cancelledAt: null,
      items: [],
      reservations: [],
    };

    it('returns the store-scoped order with its payment state', async () => {
      orders.findWithDetails.mockResolvedValue(orderRow);
      payments.getPayment.mockResolvedValue({ status: 'SUCCEEDED', failureMessage: null });

      const result = await service.getOrder(request as never, 'order-1');

      expect(orders.findWithDetails).toHaveBeenCalledWith('store-1', 'order-1');
      expect(result.orderNumber).toBe('ORD-2026-000001');
      // Phase 27 — the order-level payment status (UNPAID) is the authoritative
      // customer-facing state, independent of the attempt-level payment record.
      expect(result.paymentStatus).toBe('UNPAID');
    });

    it('returns the order without a payment record when none exists yet (best-effort)', async () => {
      orders.findWithDetails.mockResolvedValue(orderRow);
      payments.getPayment.mockRejectedValue(new NotFoundError('No payment exists for this order.'));

      const result = await service.getOrder(request as never, 'order-1');

      // The order-level payment status still renders (UNPAID); only the
      // provider-attempt failure message is absent.
      expect(result.paymentStatus).toBe('UNPAID');
      expect(result.paymentFailureMessage).toBeNull();
    });

    it('fails closed with NOT_FOUND for a cross-tenant order id (tenant isolation)', async () => {
      orders.findWithDetails.mockResolvedValue(null);

      await expect(service.getOrder(request as never, 'other-store-order')).rejects.toThrow(
        NotFoundError,
      );
      expect(payments.getPayment).not.toHaveBeenCalled();
    });
  });

  describe('cms / theme / navigation', () => {
    it('delegates getTheme with the resolved store id', async () => {
      themes.getTheme.mockResolvedValue({ id: 'theme-1', logoMediaId: null, config: {} });
      const result = await service.getTheme(request as never);
      expect(themes.getTheme).toHaveBeenCalledWith('store-1');
      expect(result).toEqual({ id: 'theme-1', logoMediaId: null, config: {} });
    });

    it('delegates getNavigation with the resolved store id', async () => {
      navigations.getNavigation.mockResolvedValue({ id: 'nav-1', name: 'Main', items: [] });
      const result = await service.getNavigation(request as never);
      expect(navigations.getNavigation).toHaveBeenCalledWith('store-1');
      expect(result).toEqual({ id: 'nav-1', name: 'Main', items: [] });
    });
  });

  describe('media content (store-scoped proxy)', () => {
    it('resolves the media row store-scoped and downloads the object bytes', async () => {
      storefrontRepository.findMediaInStore.mockResolvedValue({
        id: 'media-1',
        storagePath: 'store-1/media-1.png',
        mimeType: 'image/png',
      });
      storage.downloadObject.mockResolvedValue(Buffer.from('bytes'));

      const result = await service.getMediaContent(request as never, 'media-1');

      expect(storefrontRepository.findMediaInStore).toHaveBeenCalledWith('store-1', 'media-1');
      expect(storage.downloadObject).toHaveBeenCalledWith('store-1/media-1.png');
      expect(result).toEqual({ buffer: Buffer.from('bytes'), mimeType: 'image/png' });
    });

    it('fails closed with NOT_FOUND for a cross-tenant media id (tenant isolation)', async () => {
      storefrontRepository.findMediaInStore.mockResolvedValue(null);

      await expect(service.getMediaContent(request as never, 'media-other')).rejects.toThrow(
        NotFoundError,
      );
      expect(storage.downloadObject).not.toHaveBeenCalled();
    });
  });
});

