import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n/i18n-context';
import { ApiError } from '@/lib/api/client';

const { storefrontApiMocks, cartApiMocks } = vi.hoisted(() => ({
  storefrontApiMocks: {
    getStore: vi.fn(),
    getTheme: vi.fn(),
    getNavigation: vi.fn(),
  },
  cartApiMocks: {
    getStorefrontCart: vi.fn(),
    addStorefrontCartItem: vi.fn(),
    updateStorefrontCartItem: vi.fn(),
    removeStorefrontCartItem: vi.fn(),
    clearStorefrontCart: vi.fn(),
  },
}));

vi.mock('@/lib/api/storefront', () => ({
  storefrontApi: storefrontApiMocks,
  storefrontMediaUrlForSlug: vi.fn().mockResolvedValue('blob:media-1'),
}));

vi.mock('@/lib/api/cart', () => cartApiMocks);

import { StorefrontProvider, useStorefront } from './storefront-context';

const storeView = {
  data: {
    id: 'store-1',
    name: 'My Store',
    slug: 'my-store',
    description: null,
    currency: 'EGP',
    timezone: 'Africa/Cairo',
  },
};

const themeView = {
  data: {
    id: 'theme-1',
    logoMediaId: null,
    config: { primaryColor: '#2563eb', fontFamily: 'Inter' },
  },
};

const navigationView = {
  data: { id: 'nav-1', name: 'Main', items: [{ label: 'About', type: 'PAGE', value: 'about' }] },
};

const cartView = {
  id: 'cart-1',
  status: 'ACTIVE',
  currency: 'EGP',
  guestToken: 'guest-token-1',
  expiresAt: null,
  items: [
    {
      id: 'item-1',
      variantId: 'variant-1',
      productId: 'product-1',
      name: 'T-Shirt',
      sku: null,
      variantStatus: 'ACTIVE',
      quantity: 2,
      unitPrice: 500,
      compareAtPrice: null,
    },
  ],
  createdAt: '2026-08-14T00:00:00Z',
  updatedAt: '2026-08-14T00:00:00Z',
};

function Probe() {
  const ctx = useStorefront();
  return (
    <div>
      <span data-testid="loading">{String(ctx.loading)}</span>
      <span data-testid="store-name">{ctx.store?.name ?? 'none'}</span>
      <span data-testid="error">{ctx.error ?? 'none'}</span>
      <span data-testid="cart-count">{ctx.cartCount}</span>
      <span data-testid="cart-subtotal">{ctx.cartSubtotal}</span>
      <span data-testid="theme-primary">{String((ctx.themeVariables as Record<string, string>)['--sf-primary'])}</span>
      <button type="button" onClick={() => void ctx.addToCart('variant-2', 1)}>
        add
      </button>
      <button type="button" onClick={() => void ctx.updateCartItem('item-1', 3)}>
        update
      </button>
      <button type="button" onClick={() => void ctx.removeCartItem('item-1')}>
        remove
      </button>
      <button type="button" onClick={() => void ctx.clearCart()}>
        clear
      </button>
    </div>
  );
}

function renderProbe(slug = 'my-store') {
  return render(
    <I18nProvider>
      <StorefrontProvider slug={slug}>
        <Probe />
      </StorefrontProvider>
    </I18nProvider>,
  );
}

describe('StorefrontProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    storefrontApiMocks.getStore.mockResolvedValue(storeView);
    storefrontApiMocks.getTheme.mockResolvedValue(themeView);
    storefrontApiMocks.getNavigation.mockResolvedValue(navigationView);
    cartApiMocks.getStorefrontCart.mockRejectedValue(
      new ApiError('no token', { code: 'NOT_FOUND', status: 404 }),
    );
    cartApiMocks.addStorefrontCartItem.mockResolvedValue(cartView);
    cartApiMocks.updateStorefrontCartItem.mockResolvedValue(cartView);
    cartApiMocks.removeStorefrontCartItem.mockResolvedValue(undefined);
    cartApiMocks.clearStorefrontCart.mockResolvedValue(undefined);
  });

  it('loads the real store, theme and navigation (loading -> data)', async () => {
    renderProbe();
    expect(screen.getByTestId('loading').textContent).toBe('true');
    await waitFor(() => expect(screen.getByTestId('store-name').textContent).toBe('My Store'));
    expect(screen.getByTestId('loading').textContent).toBe('false');
    expect(screen.getByTestId('error').textContent).toBe('none');
  });

  it('applies the merchant theme as CSS variables', async () => {
    renderProbe();
    await waitFor(() => expect(screen.getByTestId('store-name').textContent).toBe('My Store'));
    expect(screen.getByTestId('theme-primary').textContent).toBe('#2563eb');
  });

  it('surfaces a store resolution error (unknown/disabled store)', async () => {
    const notFound = new ApiError('The storefront was not found.', {
      code: 'NOT_FOUND',
      status: 404,
    });
    storefrontApiMocks.getStore.mockRejectedValue(notFound);
    storefrontApiMocks.getTheme.mockRejectedValue(notFound);
    storefrontApiMocks.getNavigation.mockRejectedValue(notFound);
    renderProbe();
    await waitFor(() => expect(screen.getByTestId('error').textContent).toContain('not found'));
    expect(screen.getByTestId('store-name').textContent).toBe('none');
  });

  it('adds to cart and persists the guest token', async () => {
    renderProbe();
    await waitFor(() => expect(screen.getByTestId('store-name').textContent).toBe('My Store'));
    screen.getByText('add').click();
    await waitFor(() => expect(screen.getByTestId('cart-count').textContent).toBe('2'));
    expect(cartApiMocks.addStorefrontCartItem).toHaveBeenCalledWith('my-store', undefined, {
      variantId: 'variant-2',
      quantity: 1,
    });
    expect(window.localStorage.getItem('ziad.guest.my-store')).toBe('guest-token-1');
  });

  it('updates, removes and clears the guest cart', async () => {
    window.localStorage.setItem('ziad.guest.my-store', 'guest-token-1');
    cartApiMocks.getStorefrontCart.mockResolvedValue(cartView);
    renderProbe();
    await waitFor(() => expect(screen.getByTestId('cart-count').textContent).toBe('2'));
    expect(screen.getByTestId('cart-subtotal').textContent).toBe('1000');

    screen.getByText('update').click();
    await waitFor(() =>
      expect(cartApiMocks.updateStorefrontCartItem).toHaveBeenCalledWith(
        'my-store',
        'guest-token-1',
        'item-1',
        3,
      ),
    );

    screen.getByText('remove').click();
    await waitFor(() =>
      expect(cartApiMocks.removeStorefrontCartItem).toHaveBeenCalledWith(
        'my-store',
        'guest-token-1',
        'item-1',
      ),
    );

    screen.getByText('clear').click();
    await waitFor(() => expect(screen.getByTestId('cart-count').textContent).toBe('0'));
    expect(cartApiMocks.clearStorefrontCart).toHaveBeenCalledWith('my-store', 'guest-token-1');
    expect(window.localStorage.getItem('ziad.guest.my-store')).toBeNull();
  });
});

