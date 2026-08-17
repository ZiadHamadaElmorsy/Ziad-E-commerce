import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/lib/i18n/i18n-context';
import type { StorefrontImage } from '@/lib/storefront/types';
import { StorefrontGallery } from './StorefrontGallery';

const { storefrontApiMocks } = vi.hoisted(() => ({
  storefrontApiMocks: {
    getStore: vi.fn(),
    getTheme: vi.fn(),
    getNavigation: vi.fn(),
    listProductMedia: vi.fn(),
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

function wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <StorefrontProvider slug="my-store">{children}</StorefrontProvider>
    </I18nProvider>
  );
}

function image(id: string, opts: Partial<StorefrontImage> = {}): StorefrontImage {
  return { id, altText: null, variantId: null, isPrimary: false, sortOrder: 0, ...opts };
}

const productLevelImages = [image('m1', { sortOrder: 0 }), image('m2', { sortOrder: 1 })];

const blackVariantImage = image('m3', { variantId: 'variant-black', sortOrder: 2 });
const whiteVariantImage = image('m4', { variantId: 'variant-white', sortOrder: 3 });

beforeEach(() => {
  vi.clearAllMocks();
  storefrontApiMocks.getStore.mockResolvedValue({
    data: {
      id: 'store-1',
      name: 'My Store',
      slug: 'my-store',
      description: null,
      currency: 'EGP',
      timezone: 'Africa/Cairo',
    },
  });
  storefrontApiMocks.getTheme.mockResolvedValue({ data: { id: 't1', logoMediaId: null, config: {} } });
  storefrontApiMocks.getNavigation.mockResolvedValue({ data: { id: 'n1', name: 'Main', items: [] } });
  storefrontApiMocks.listProductMedia.mockResolvedValue({
    data: [],
    meta: { page: 1, limit: 12, total: 0, totalPages: 1 },
  });
});

describe('StorefrontGallery', () => {
  it('renders the main image and a thumbnail strip for multiple images', async () => {
    render(
      <StorefrontGallery
        productSlug="classic-t-shirt"
        productName="Classic T-Shirt"
        initialImages={productLevelImages}
        totalImages={2}
        selectedVariantId={null}
      />,
      { wrapper },
    );
    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(2));
    expect(screen.getByLabelText('Previous image')).toBeTruthy();
    expect(screen.getByLabelText('Next image')).toBeTruthy();
  });

  it('falls back to product-level images when the selected variant has none', async () => {
    render(
      <StorefrontGallery
        productSlug="classic-t-shirt"
        productName="Classic T-Shirt"
        initialImages={[...productLevelImages, blackVariantImage, whiteVariantImage]}
        totalImages={4}
        selectedVariantId="variant-with-no-images"
      />,
      { wrapper },
    );
    // No dedicated images for this variant → product-level gallery only.
    // Black/white variant images must never leak into another variant's view.
    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(2));
  });

  it('shows only the variant images when the variant has dedicated images', async () => {
    render(
      <StorefrontGallery
        productSlug="classic-t-shirt"
        productName="Classic T-Shirt"
        initialImages={[...productLevelImages, blackVariantImage, whiteVariantImage]}
        totalImages={4}
        selectedVariantId="variant-black"
      />,
      { wrapper },
    );
    // A single dedicated image → no thumbnail strip, and the position label
    // confirms exactly one image is in the gallery (m4 must never appear).
    await waitFor(() => expect(screen.getByText(/Image 1 of 1/)).toBeTruthy());
  });

  it('renders the empty state when the variant has no images at all', async () => {
    render(
      <StorefrontGallery
        productSlug="no-image-product"
        productName="No Image Product"
        initialImages={[]}
        totalImages={0}
        selectedVariantId="variant-x"
      />,
      { wrapper },
    );
    await waitFor(() => expect(screen.getByText('No images available for this option.')).toBeTruthy());
  });
});
