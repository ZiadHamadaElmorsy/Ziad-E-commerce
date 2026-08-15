import { bucketForPath, EXEMPT_BUCKET } from './rate-limit.constants';

describe('bucketForPath (rate limiting classification)', () => {
  it('maps authentication/onboarding routes to the auth bucket', () => {
    expect(bucketForPath('/api/v1/auth/me')).toBe('auth');
    expect(bucketForPath('/api/v1/onboarding/merchant')).toBe('auth');
    expect(bucketForPath('/api/v1/onboarding/status')).toBe('auth');
  });

  it('maps public storefront reads to the storefront-read bucket', () => {
    expect(bucketForPath('/api/v1/storefront')).toBe('storefront-read');
    expect(bucketForPath('/api/v1/storefront/products')).toBe('storefront-read');
    expect(bucketForPath('/api/v1/storefront/products/jeans')).toBe('storefront-read');
    expect(bucketForPath('/api/v1/storefront/categories')).toBe('storefront-read');
    expect(bucketForPath('/api/v1/storefront/pages/about')).toBe('storefront-read');
    expect(bucketForPath('/api/v1/storefront/theme')).toBe('storefront-read');
    expect(bucketForPath('/api/v1/storefront/navigation')).toBe('storefront-read');
  });

  it('maps storefront cart routes to the cart bucket', () => {
    expect(bucketForPath('/api/v1/storefront/cart')).toBe('cart');
    expect(bucketForPath('/api/v1/storefront/cart/items')).toBe('cart');
    expect(bucketForPath('/api/v1/storefront/cart/items/item-1')).toBe('cart');
  });

  it('maps checkout to the checkout bucket', () => {
    expect(bucketForPath('/api/v1/storefront/checkout')).toBe('checkout');
    expect(bucketForPath('/api/v1/checkout')).toBe('checkout');
  });

  it('maps payment creation to the payment bucket and order reads to order-lookup', () => {
    expect(bucketForPath('/api/v1/storefront/orders/order-1/payments')).toBe('payment');
    expect(bucketForPath('/api/v1/orders/order-1/payments')).toBe('payment');
    expect(bucketForPath('/api/v1/storefront/orders/order-1')).toBe('order-lookup');
    expect(bucketForPath('/api/v1/storefront/orders/order-1/payment')).toBe('order-lookup');
    expect(bucketForPath('/api/v1/orders/order-1')).toBe('order-lookup');
  });

  it('maps the media proxy to the media bucket', () => {
    expect(bucketForPath('/api/v1/storefront/media/media-1/content')).toBe('media');
  });

  it('maps webhooks to the webhook bucket', () => {
    expect(bucketForPath('/api/v1/webhooks/paymob')).toBe('webhook');
  });

  it('exempts the health endpoint from rate limiting', () => {
    expect(bucketForPath('/api/v1/health')).toBe(EXEMPT_BUCKET);
  });

  it('maps every other route to the merchant-api bucket', () => {
    expect(bucketForPath('/api/v1/products')).toBe('merchant-api');
    expect(bucketForPath('/api/v1/media')).toBe('merchant-api');
    expect(bucketForPath('/api/v1/dashboard/revenue')).toBe('merchant-api');
    expect(bucketForPath('/')).toBe('merchant-api');
  });

  it('ignores query strings when classifying', () => {
    expect(bucketForPath('/api/v1/storefront/products?page=2&search=x')).toBe(
      'storefront-read',
    );
  });
});
