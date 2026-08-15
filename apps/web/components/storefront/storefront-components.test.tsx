import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/lib/i18n/i18n-context';

const { storefrontApiMocks } = vi.hoisted(() => ({
  storefrontApiMocks: {
    getStore: vi.fn(),
    getTheme: vi.fn(),
    getNavigation: vi.fn(),
    listProducts: vi.fn(),
    listCategories: vi.fn(),
  },
}));

vi.mock('@/lib/api/storefront', () => ({
  storefrontApi: storefrontApiMocks,
  storefrontMediaUrlForSlug: vi.fn().mockResolvedValue(''),
}));

vi.mock('@/lib/api/cart', () => ({
  getStorefrontCart: vi.fn(),
  addStorefrontCartItem: vi.fn(),
}));

import { StorefrontProvider } from '@/lib/storefront/storefront-context';
import { ProductCard } from './ProductCard';
import { SectionRenderer } from './SectionRenderer';
import { StorefrontEmpty } from './StorefrontStates';

function wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <StorefrontProvider slug="my-store">{children}</StorefrontProvider>
    </I18nProvider>
  );
}

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
  data: { id: 'theme-1', logoMediaId: null, config: { primaryColor: '#2563eb' } },
};

const navigationView = {
  data: { id: 'nav-1', name: 'Main', items: [] },
};

const product = {
  id: 'product-1',
  name: 'Classic T-Shirt',
  slug: 'classic-t-shirt',
  description: 'Cotton classic',
  images: [{ id: 'media-1', altText: 'Front' }],
  variants: [
    { id: 'variant-1', name: 'Black / Medium', price: 500, available: true },
    { id: 'variant-2', name: 'Black / Large', price: 550, available: false },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  storefrontApiMocks.getStore.mockResolvedValue(storeView);
  storefrontApiMocks.getTheme.mockResolvedValue(themeView);
  storefrontApiMocks.getNavigation.mockResolvedValue(navigationView);
  storefrontApiMocks.listProducts.mockResolvedValue({ data: [], meta: { page: 1, limit: 8, total: 0, totalPages: 0 } });
  storefrontApiMocks.listCategories.mockResolvedValue({ data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } });
});

describe('ProductCard', () => {
  it('renders the product name, price and link', async () => {
    render(<ProductCard product={product} />, { wrapper });
    await waitFor(() => expect(screen.getByText('Classic T-Shirt')).toBeTruthy());
    const link = screen.getByRole('link', { name: 'Classic T-Shirt' });
    expect(link.getAttribute('href')).toBe('/store/my-store/products/classic-t-shirt');
  });

  it('shows the lowest available price', async () => {
    render(<ProductCard product={product} />, { wrapper });
    await waitFor(() => expect(screen.getByText(/EGP 5\.00/)).toBeTruthy());
  });

  it('shows an out-of-stock badge when no variant is available', async () => {
    render(
      <ProductCard
        product={{
          ...product,
          variants: [
            { id: 'variant-1', name: 'Black / M', price: 500, available: false },
          ],
        }}
      />,
      { wrapper },
    );
    await waitFor(() => expect(screen.getByText('Out of stock')).toBeTruthy());
  });
});

describe('SectionRenderer', () => {
  it('renders a hero section with title, subtitle and CTA', async () => {
    render(
      <SectionRenderer
        section={{
          id: 's1',
          sectionType: 'hero',
          content: { title: 'Welcome', subtitle: 'Fresh goods', ctaLabel: 'Shop', ctaLink: '/products' },
          sortOrder: 0,
        }}
      />,
      { wrapper },
    );
    await waitFor(() => expect(screen.getByText('Welcome')).toBeTruthy());
    expect(screen.getByText('Fresh goods')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Shop' }).getAttribute('href')).toBe('/products');
  });

  it('renders a text section body', async () => {
    render(
      <SectionRenderer
        section={{ id: 's2', sectionType: 'text', content: { body: 'About us content' }, sortOrder: 0 }}
      />,
      { wrapper },
    );
    await waitFor(() => expect(screen.getByText('About us content')).toBeTruthy());
  });
});

describe('StorefrontEmpty', () => {
  it('renders title, description and action', () => {
    render(
      <StorefrontEmpty title="Cart is empty" description="Add items" action={<a href="/x">Shop</a>} />,
      { wrapper },
    );
    expect(screen.getByText('Cart is empty')).toBeTruthy();
    expect(screen.getByText('Add items')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Shop' })).toBeTruthy();
  });
});
