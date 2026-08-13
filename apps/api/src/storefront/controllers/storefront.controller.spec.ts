import 'reflect-metadata';
import type { Request } from 'express';
import { ListStorefrontCategoriesQueryDto } from '../dto/list-storefront-categories-query.dto';
import { ListStorefrontProductsQueryDto } from '../dto/list-storefront-products-query.dto';
import { StorefrontService } from '../services/storefront.service';
import { StorefrontController } from './storefront.controller';

describe('StorefrontController', () => {
  let storefront: {
    getStore: jest.Mock;
    listProducts: jest.Mock;
    getProductBySlug: jest.Mock;
    listCategories: jest.Mock;
    getCategoryBySlug: jest.Mock;
    getPageBySlug: jest.Mock;
  };
  let controller: StorefrontController;
  let request: Request;

  beforeEach(() => {
    storefront = {
      getStore: jest.fn(),
      listProducts: jest.fn(),
      getProductBySlug: jest.fn(),
      listCategories: jest.fn(),
      getCategoryBySlug: jest.fn(),
      getPageBySlug: jest.fn(),
    };
    controller = new StorefrontController(storefront as unknown as StorefrontService);
    request = { headers: { 'x-storefront-slug': 'my-store' } } as unknown as Request;
  });

  it('GET /storefront delegates and wraps in the data envelope', async () => {
    storefront.getStore.mockResolvedValue({ id: 'store-1', name: 'My Store' });

    const result = await controller.getStore(request);

    expect(storefront.getStore).toHaveBeenCalledWith(request);
    expect(result).toEqual({ data: { id: 'store-1', name: 'My Store' } });
  });

  it('GET /storefront/products delegates with the query DTO and returns data + meta', async () => {
    storefront.listProducts.mockResolvedValue({
      items: [{ id: 'product-1' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    const query = new ListStorefrontProductsQueryDto();
    const result = await controller.listProducts(request, query);

    expect(storefront.listProducts).toHaveBeenCalledWith(request, query);
    expect(result).toEqual({
      data: [{ id: 'product-1' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });

  it('GET /storefront/products/:slug delegates with the slug', async () => {
    storefront.getProductBySlug.mockResolvedValue({ id: 'product-1' });

    const result = await controller.getProductBySlug(request, 'classic-t-shirt');

    expect(storefront.getProductBySlug).toHaveBeenCalledWith(request, 'classic-t-shirt');
    expect(result).toEqual({ data: { id: 'product-1' } });
  });

  it('GET /storefront/categories delegates and returns data + meta', async () => {
    storefront.listCategories.mockResolvedValue({
      items: [{ id: 'category-1' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    const query = new ListStorefrontCategoriesQueryDto();
    const result = await controller.listCategories(request, query);

    expect(storefront.listCategories).toHaveBeenCalledWith(request, query);
    expect(result).toEqual({
      data: [{ id: 'category-1' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });

  it('GET /storefront/categories/:slug delegates with the slug and query', async () => {
    storefront.getCategoryBySlug.mockResolvedValue({ id: 'category-1', products: [] });

    const query = new ListStorefrontCategoriesQueryDto();
    const result = await controller.getCategoryBySlug(request, 't-shirts', query);

    expect(storefront.getCategoryBySlug).toHaveBeenCalledWith(request, 't-shirts', query);
    expect(result).toEqual({ data: { id: 'category-1', products: [] } });
  });

  it('GET /storefront/pages/:slug delegates with the slug', async () => {
    storefront.getPageBySlug.mockResolvedValue({ id: 'page-1' });

    const result = await controller.getPageBySlug(request, 'about');

    expect(storefront.getPageBySlug).toHaveBeenCalledWith(request, 'about');
    expect(result).toEqual({ data: { id: 'page-1' } });
  });
});
