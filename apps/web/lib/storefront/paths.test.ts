import { describe, expect, it } from 'vitest';
import {
  navigationItemPath,
  storeCartPath,
  storeCategoriesPath,
  storeCategoryPath,
  storeCheckoutPath,
  storeHomePath,
  storeOrderPath,
  storeOrderTrackingPath,
  storePagePath,
  storeProductPath,
  storeProductsPath,
} from './paths';

describe('storefront routing helpers', () => {
  it('builds the documented /store/[slug]/... routes', () => {
    expect(storeHomePath('my-store')).toBe('/store/my-store');
    expect(storeProductsPath('my-store')).toBe('/store/my-store/products');
    expect(storeProductPath('my-store', 't-shirt')).toBe('/store/my-store/products/t-shirt');
    expect(storeCategoriesPath('my-store')).toBe('/store/my-store/categories');
    expect(storeCategoryPath('my-store', 'shirts')).toBe('/store/my-store/categories/shirts');
    expect(storePagePath('my-store', 'about')).toBe('/store/my-store/pages/about');
    expect(storeCartPath('my-store')).toBe('/store/my-store/cart');
    expect(storeCheckoutPath('my-store')).toBe('/store/my-store/checkout');
    expect(storeOrderPath('my-store', 'order-1')).toBe('/store/my-store/orders/order-1');
  });

  it('builds the customer tracking route (Phase 27 — Part 13)', () => {
    expect(storeOrderTrackingPath('my-store', 'order-1')).toBe(
      '/store/my-store/orders/order-1/tracking',
    );
  });

  it('maps CMS navigation items to storefront routes', () => {
    expect(
      navigationItemPath('my-store', { label: 'About', type: 'PAGE', value: 'about' }),
    ).toBe('/store/my-store/pages/about');
    expect(
      navigationItemPath('my-store', { label: 'Shirts', type: 'CATEGORY', value: 'shirts' }),
    ).toBe('/store/my-store/categories/shirts');
    expect(
      navigationItemPath('my-store', { label: 'Products', type: 'DESTINATION', value: 'products' }),
    ).toBe('/store/my-store/products');
    expect(
      navigationItemPath('my-store', { label: 'Home', type: 'DESTINATION', value: 'home' }),
    ).toBe('/store/my-store');
    // Unknown destinations fall back to the store home.
    expect(
      navigationItemPath('my-store', { label: 'X', type: 'DESTINATION', value: 'nope' }),
    ).toBe('/store/my-store');
  });
});
