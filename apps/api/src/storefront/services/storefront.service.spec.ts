import { NotFoundError } from '../../common/errors/domain-exceptions';
import { ListStorefrontCategoriesQueryDto } from '../dto/list-storefront-categories-query.dto';
import { ListStorefrontProductMediaQueryDto } from '../dto/list-storefront-product-media-query.dto';
import { ListStorefrontProductsQueryDto } from '../dto/list-storefront-products-query.dto';
import { StorefrontRepository } from '../repositories/storefront.repository';
import { StorefrontStoreResolver } from './storefront-store-resolver';
import { StorefrontService } from './storefront.service';

describe('StorefrontService', () => {
  let storeResolver: { resolve: jest.Mock };
  let settings: { readWhatsAppSettings: jest.Mock };
  let config: { get: jest.Mock };
  let storefrontRepository: {
    findStoreBySlug: jest.Mock;
    findActiveProducts: jest.Mock;
    countActiveProducts: jest.Mock;
    findActiveProductBySlug: jest.Mock;
    findActiveCategories: jest.Mock;
    countActiveCategories: jest.Mock;
    findActiveCategoryBySlug: jest.Mock;
    findActiveProductsByCategory: jest.Mock;
    countActiveProductsByCategory: jest.Mock;
    findActiveProductMedia: jest.Mock;
    countActiveProductMedia: jest.Mock;
    findPublishedPageBySlug: jest.Mock;
  };
  let service: StorefrontService;

  const resolvedStore = {
    id: 'store-1',
    slug: 'my-store',
    name: 'My Store',
    description: null,
    currency: 'EGP',
    timezone: 'Africa/Cairo',
  };

  const productRow = {
    id: 'product-1',
    name: 'Classic T-Shirt',
    slug: 'classic-t-shirt',
    description: 'Cotton',
    variants: [
      {
        id: 'variant-1',
        name: 'Black / Medium',
        price: 500n,
        status: 'ACTIVE',
        inventory: { onHandQuantity: 10, reservedQuantity: 2 },
      },
    ],
    productMedia: [{ media: { id: 'media-1', altText: 'Front' } }],
  };

  const categoryRow = {
    id: 'category-1',
    storeId: 'store-1',
    name: 'T-Shirts',
    slug: 't-shirts',
    description: null,
    status: 'ACTIVE',
  };

  beforeEach(() => {
    storeResolver = { resolve: jest.fn() };
    settings = { readWhatsAppSettings: jest.fn() };
    config = { get: jest.fn() };
    storefrontRepository = {
      findStoreBySlug: jest.fn(),
      findActiveProducts: jest.fn(),
      countActiveProducts: jest.fn(),
      findActiveProductBySlug: jest.fn(),
      findActiveCategories: jest.fn(),
      countActiveCategories: jest.fn(),
      findActiveCategoryBySlug: jest.fn(),
      findActiveProductsByCategory: jest.fn(),
      countActiveProductsByCategory: jest.fn(),
      findActiveProductMedia: jest.fn(),
      countActiveProductMedia: jest.fn(),
      findPublishedPageBySlug: jest.fn(),
    };
    service = new StorefrontService(
      storeResolver as unknown as StorefrontStoreResolver,
      storefrontRepository as unknown as StorefrontRepository,
      settings as never,
      config as never,
    );
    storeResolver.resolve.mockResolvedValue(resolvedStore);
  });

  it('getStore returns the public store configuration + payment methods', async () => {
    settings.readWhatsAppSettings.mockResolvedValue({
      enabled: true,
      phoneNumber: '201012345678',
      label: null,
    });
    config.get.mockReturnValue({ apiKey: 'k', integrationId: 'i', publicKey: 'p' });

    await expect(service.getStore({ headers: {} })).resolves.toEqual({
      id: 'store-1',
      name: 'My Store',
      slug: 'my-store',
      description: null,
      currency: 'EGP',
      timezone: 'Africa/Cairo',
      payments: {
        payOnline: true,
        whatsapp: { enabled: true, phoneNumber: '201012345678', label: null },
      },
    });
  });

  it('listProducts is store-scoped, passes search + pagination, and maps the public view', async () => {
    storefrontRepository.findActiveProducts.mockResolvedValue([productRow]);
    storefrontRepository.countActiveProducts.mockResolvedValue(1);

    const query = new ListStorefrontProductsQueryDto();
    query.search = 'tshirt';

    const result = await service.listProducts({ headers: {} }, query);

    expect(storefrontRepository.findActiveProducts).toHaveBeenCalledWith('store-1', {
      search: 'tshirt',
      skip: 0,
      take: 20,
    });
    expect(storefrontRepository.countActiveProducts).toHaveBeenCalledWith('store-1', 'tshirt');
    expect(result).toEqual({
      items: [
        {
          id: 'product-1',
          name: 'Classic T-Shirt',
          slug: 'classic-t-shirt',
          description: 'Cotton',
          categories: [],
          images: [{ id: 'media-1', altText: 'Front' }],
          totalImages: 1,
          variants: [
            {
              id: 'variant-1',
              name: 'Black / Medium',
              attributes: null,
              price: 500,
              available: true,
            },
          ],
        },
      ],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });

  it('listProducts computes pagination metadata', async () => {
    storefrontRepository.findActiveProducts.mockResolvedValue([]);
    storefrontRepository.countActiveProducts.mockResolvedValue(45);

    const query = new ListStorefrontProductsQueryDto();
    query.page = 3;
    query.limit = 20;

    const result = await service.listProducts({ headers: {} }, query);

    expect(result.meta).toEqual({ page: 3, limit: 20, total: 45, totalPages: 3 });
    expect(storefrontRepository.findActiveProducts).toHaveBeenCalledWith('store-1', {
      search: undefined,
      skip: 40,
      take: 20,
    });
  });

  it('getProductBySlug returns the ACTIVE product view', async () => {
    storefrontRepository.findActiveProductBySlug.mockResolvedValue(productRow);

    const result = await service.getProductBySlug({ headers: {} }, 'classic-t-shirt');

    expect(storefrontRepository.findActiveProductBySlug).toHaveBeenCalledWith(
      'store-1',
      'classic-t-shirt',
    );
    expect(result.slug).toBe('classic-t-shirt');
  });

  it('getProductBySlug fails closed with NOT_FOUND for a missing product', async () => {
    storefrontRepository.findActiveProductBySlug.mockResolvedValue(null);

    await expect(service.getProductBySlug({ headers: {} }, 'missing')).rejects.toThrow(
      NotFoundError,
    );
  });

  it('listProductMedia returns the paginated ACTIVE-product gallery', async () => {
    storefrontRepository.findActiveProductBySlug.mockResolvedValue({ id: 'product-1' });
    storefrontRepository.findActiveProductMedia.mockResolvedValue([
      {
        mediaId: 'media-1',
        variantId: null,
        altText: 'Front',
        sortOrder: 0,
        isPrimary: true,
      },
      {
        mediaId: 'media-2',
        variantId: 'variant-1',
        altText: 'Black back',
        sortOrder: 1,
        isPrimary: false,
      },
    ]);
    storefrontRepository.countActiveProductMedia.mockResolvedValue(2);

    const query = new ListStorefrontProductMediaQueryDto();
    query.page = 1;
    query.limit = 12;

    const result = await service.listProductMedia({ headers: {} }, 'classic-t-shirt', query);

    expect(storefrontRepository.findActiveProductMedia).toHaveBeenCalledWith('store-1', 'product-1', {
      variantId: undefined,
      skip: 0,
      take: 12,
    });
    expect(result).toEqual({
      items: [
        { mediaId: 'media-1', variantId: null, altText: 'Front', sortOrder: 0, isPrimary: true },
        { mediaId: 'media-2', variantId: 'variant-1', altText: 'Black back', sortOrder: 1, isPrimary: false },
      ],
      meta: { page: 1, limit: 12, total: 2, totalPages: 1 },
    });
  });

  it('listProductMedia fails closed with NOT_FOUND for a missing/unpublished product', async () => {
    storefrontRepository.findActiveProductBySlug.mockResolvedValue(null);

    await expect(
      service.listProductMedia({ headers: {} }, 'draft', new ListStorefrontProductMediaQueryDto()),
    ).rejects.toThrow(NotFoundError);
  });

  it('listCategories returns only ACTIVE categories with pagination', async () => {
    storefrontRepository.findActiveCategories.mockResolvedValue([categoryRow]);
    storefrontRepository.countActiveCategories.mockResolvedValue(1);

    const result = await service.listCategories(
      { headers: {} },
      new ListStorefrontCategoriesQueryDto(),
    );

    expect(storefrontRepository.findActiveCategories).toHaveBeenCalledWith('store-1', {
      skip: 0,
      take: 20,
    });
    expect(result.items).toEqual([
      { id: 'category-1', name: 'T-Shirts', slug: 't-shirts', description: null },
    ]);
  });

  it('getCategoryBySlug returns the ACTIVE category with its ACTIVE products', async () => {
    storefrontRepository.findActiveCategoryBySlug.mockResolvedValue(categoryRow);
    storefrontRepository.findActiveProductsByCategory.mockResolvedValue([productRow]);
    storefrontRepository.countActiveProductsByCategory.mockResolvedValue(1);

    const result = await service.getCategoryBySlug(
      { headers: {} },
      't-shirts',
      new ListStorefrontCategoriesQueryDto(),
    );

    expect(storefrontRepository.findActiveProductsByCategory).toHaveBeenCalledWith(
      'store-1',
      'category-1',
      { skip: 0, take: 20 },
    );
    expect(result).toEqual({
      id: 'category-1',
      name: 'T-Shirts',
      slug: 't-shirts',
      description: null,
      products: [expect.objectContaining({ id: 'product-1' })],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });

  it('getCategoryBySlug fails closed with NOT_FOUND for a missing category', async () => {
    storefrontRepository.findActiveCategoryBySlug.mockResolvedValue(null);

    await expect(
      service.getCategoryBySlug({ headers: {} }, 'missing', new ListStorefrontCategoriesQueryDto()),
    ).rejects.toThrow(NotFoundError);
  });

  it('getPageBySlug returns the PUBLISHED page with sections and SEO metadata', async () => {
    storefrontRepository.findPublishedPageBySlug.mockResolvedValue({
      id: 'page-1',
      storeId: 'store-1',
      title: 'About',
      slug: 'about',
      status: 'PUBLISHED',
      seoTitle: 'About Us',
      seoDescription: null,
      createdAt: new Date('2026-08-12T00:00:00Z'),
      updatedAt: new Date('2026-08-12T00:00:00Z'),
      sections: [
        {
          id: 's-1',
          storeId: 'store-1',
          pageId: 'page-1',
          sectionType: 'text',
          content: { body: 'x' },
          sortOrder: 0,
        },
      ],
    });

    const result = await service.getPageBySlug({ headers: {} }, 'about');

    expect(storefrontRepository.findPublishedPageBySlug).toHaveBeenCalledWith('store-1', 'about');
    expect(result).toEqual({
      id: 'page-1',
      title: 'About',
      slug: 'about',
      seoTitle: 'About Us',
      seoDescription: null,
      sections: [{ id: 's-1', sectionType: 'text', content: { body: 'x' }, sortOrder: 0 }],
    });
  });

  it('getPageBySlug fails closed with NOT_FOUND for a missing/unpublished page', async () => {
    storefrontRepository.findPublishedPageBySlug.mockResolvedValue(null);

    await expect(service.getPageBySlug({ headers: {} }, 'draft')).rejects.toThrow(NotFoundError);
  });

  it('every operation propagates store resolution failures', async () => {
    storeResolver.resolve.mockRejectedValue(new NotFoundError('The storefront was not found.'));

    await expect(
      service.listProducts({ headers: {} }, new ListStorefrontProductsQueryDto()),
    ).rejects.toThrow(NotFoundError);
    await expect(service.getStore({ headers: {} })).rejects.toThrow(NotFoundError);
  });
});
