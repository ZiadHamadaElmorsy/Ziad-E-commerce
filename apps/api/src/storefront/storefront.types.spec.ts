import { VariantStatus } from '@prisma/client';
import {
  StorefrontProductRow,
  toStorefrontCategoryView,
  toStorefrontPageView,
  toStorefrontProductView,
  toStorefrontStoreView,
} from './storefront.types';

describe('Storefront types / mappers', () => {
  const storeRow = {
    id: 'store-1',
    name: 'My Store',
    slug: 'my-store',
    description: 'A test store',
    currency: 'EGP',
    timezone: 'Africa/Cairo',
  };

  it('toStorefrontStoreView exposes only public store configuration', () => {
    expect(toStorefrontStoreView(storeRow)).toEqual({
      id: 'store-1',
      name: 'My Store',
      slug: 'my-store',
      description: 'A test store',
      currency: 'EGP',
      timezone: 'Africa/Cairo',
    });
  });

  it('toStorefrontProductView maps price as integer minor units and derived availability', () => {
    const product: StorefrontProductRow = {
      id: 'product-1',
      name: 'Classic T-Shirt',
      slug: 'classic-t-shirt',
      description: 'Cotton',
      variants: [
        {
          id: 'variant-1',
          name: 'Black / Medium',
          price: 500n,
          status: VariantStatus.ACTIVE,
          inventory: { onHandQuantity: 10, reservedQuantity: 2 },
        },
        {
          id: 'variant-2',
          name: 'White / Large',
          price: 600n,
          status: VariantStatus.ACTIVE,
          inventory: { onHandQuantity: 0, reservedQuantity: 0 },
        },
        {
          id: 'variant-3',
          name: 'Archived',
          price: 700n,
          status: VariantStatus.ARCHIVED,
          inventory: { onHandQuantity: 5, reservedQuantity: 0 },
        },
      ],
      productMedia: [{ media: { id: 'media-1', altText: 'Front view' } }],
    };

    expect(toStorefrontProductView(product)).toEqual({
      id: 'product-1',
      name: 'Classic T-Shirt',
      slug: 'classic-t-shirt',
      description: 'Cotton',
      images: [{ id: 'media-1', altText: 'Front view' }],
      variants: [
        { id: 'variant-1', name: 'Black / Medium', price: 500, available: true },
        { id: 'variant-2', name: 'White / Large', price: 600, available: false },
      ],
    });
  });

  it('toStorefrontProductView reports a variant with no inventory row as unavailable (fail closed)', () => {
    const product: StorefrontProductRow = {
      id: 'product-1',
      name: 'No Stock Row',
      slug: 'no-stock-row',
      description: null,
      variants: [
        {
          id: 'variant-1',
          name: 'Default',
          price: 100n,
          status: VariantStatus.ACTIVE,
          inventory: null,
        },
      ],
      productMedia: [],
    };

    expect(toStorefrontProductView(product).variants).toEqual([
      { id: 'variant-1', name: 'Default', price: 100, available: false },
    ]);
  });

  it('toStorefrontCategoryView exposes only public category fields', () => {
    expect(
      toStorefrontCategoryView({
        id: 'c-1',
        name: 'T-Shirts',
        slug: 't-shirts',
        description: null,
      }),
    ).toEqual({ id: 'c-1', name: 'T-Shirts', slug: 't-shirts', description: null });
  });

  it('toStorefrontPageView exposes sections ordered as provided with SEO metadata', () => {
    expect(
      toStorefrontPageView({
        id: 'page-1',
        title: 'About',
        slug: 'about',
        seoTitle: 'About Us',
        seoDescription: 'Learn about the store',
        sections: [{ id: 's-1', sectionType: 'text', content: { body: 'Hello' }, sortOrder: 0 }],
      }),
    ).toEqual({
      id: 'page-1',
      title: 'About',
      slug: 'about',
      seoTitle: 'About Us',
      seoDescription: 'Learn about the store',
      sections: [{ id: 's-1', sectionType: 'text', content: { body: 'Hello' }, sortOrder: 0 }],
    });
  });
});
