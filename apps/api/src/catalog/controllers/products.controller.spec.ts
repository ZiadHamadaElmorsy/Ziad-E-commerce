import 'reflect-metadata';
import { CreateProductDto } from '../dto/create-product.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { CreateVariantDto } from '../dto/create-variant.dto';
import { ListProductsQueryDto } from '../dto/list-products-query.dto';
import { ProductsService } from '../services/products.service';
import { VariantsService } from '../services/variants.service';
import { CategoriesService } from '../services/categories.service';
import { ProductsController } from './products.controller';

describe('ProductsController', () => {
  let products: {
    list: jest.Mock;
    get: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    publish: jest.Mock;
    unpublish: jest.Mock;
    archive: jest.Mock;
  };
  let variants: { listByProduct: jest.Mock; create: jest.Mock };
  let categories: {
    assignProduct: jest.Mock;
    removeProductFromCategory: jest.Mock;
    listForProduct: jest.Mock;
  };
  let controller: ProductsController;

  beforeEach(() => {
    products = {
      list: jest.fn(),
      get: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      publish: jest.fn(),
      unpublish: jest.fn(),
      archive: jest.fn(),
    };
    variants = { listByProduct: jest.fn(), create: jest.fn() };
    categories = {
      assignProduct: jest.fn(),
      removeProductFromCategory: jest.fn(),
      listForProduct: jest.fn(),
    };
    controller = new ProductsController(
      products as unknown as ProductsService,
      variants as unknown as VariantsService,
      categories as unknown as CategoriesService,
    );
  });

  it('GET /products delegates to the service and wraps the result in the data/meta envelope', async () => {
    products.list.mockResolvedValue({
      items: [{ id: 'product-1' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    const result = await controller.list(new ListProductsQueryDto());

    expect(products.list).toHaveBeenCalled();
    expect(result).toEqual({
      data: [{ id: 'product-1' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });

  it('GET /products/:productId delegates to the service', async () => {
    products.get.mockResolvedValue({ id: 'product-1' });

    expect(await controller.get('product-1')).toEqual({ data: { id: 'product-1' } });
  });

  it('POST /products delegates to the service', async () => {
    products.create.mockResolvedValue({ id: 'product-1' });

    const dto = new CreateProductDto();
    dto.name = 'Classic T-Shirt';

    expect(await controller.create(dto)).toEqual({ data: { id: 'product-1' } });
    expect(products.create).toHaveBeenCalledWith(dto);
  });

  it('PATCH /products/:productId delegates to the service', async () => {
    products.update.mockResolvedValue({ id: 'product-1', name: 'Updated' });

    const dto = new UpdateProductDto();
    dto.name = 'Updated';

    expect(await controller.update('product-1', dto)).toEqual({
      data: { id: 'product-1', name: 'Updated' },
    });
  });

  it('delegates publish / unpublish / archive to the service', async () => {
    products.publish.mockResolvedValue({ id: 'product-1', status: 'ACTIVE' });
    products.unpublish.mockResolvedValue({ id: 'product-1', status: 'DRAFT' });
    products.archive.mockResolvedValue({ id: 'product-1', status: 'ARCHIVED' });

    expect(await controller.publish('product-1')).toEqual({
      data: { id: 'product-1', status: 'ACTIVE' },
    });
    expect(await controller.unpublish('product-1')).toEqual({
      data: { id: 'product-1', status: 'DRAFT' },
    });
    expect(await controller.archive('product-1')).toEqual({
      data: { id: 'product-1', status: 'ARCHIVED' },
    });
  });

  it('delegates nested variant routes to VariantsService', async () => {
    variants.listByProduct.mockResolvedValue([{ id: 'variant-1' }]);
    variants.create.mockResolvedValue({ id: 'variant-1' });

    expect(await controller.listVariants('product-1')).toEqual({ data: [{ id: 'variant-1' }] });
    expect(variants.listByProduct).toHaveBeenCalledWith('product-1');

    const dto = new CreateVariantDto();
    dto.name = 'Black / Medium';
    dto.price = 500;

    expect(await controller.createVariant('product-1', dto)).toEqual({
      data: { id: 'variant-1' },
    });
    expect(variants.create).toHaveBeenCalledWith('product-1', dto);
  });

  it('delegates assign/remove category links to CategoriesService', async () => {
    categories.assignProduct.mockResolvedValue({
      productId: 'product-1',
      categoryId: 'category-1',
    });
    categories.removeProductFromCategory.mockResolvedValue(undefined);

    expect(await controller.assignCategory('product-1', 'category-1')).toEqual({
      data: { productId: 'product-1', categoryId: 'category-1' },
    });
    await expect(controller.removeCategory('product-1', 'category-1')).resolves.toBeUndefined();
    expect(categories.removeProductFromCategory).toHaveBeenCalledWith('product-1', 'category-1');
  });

  it('GET /products/:productId/categories delegates to CategoriesService', async () => {
    categories.listForProduct.mockResolvedValue([
      { id: 'category-1', name: 'T-Shirts', slug: 't-shirts', status: 'ACTIVE' },
    ]);

    expect(await controller.listCategories('product-1')).toEqual({
      data: [{ id: 'category-1', name: 'T-Shirts', slug: 't-shirts', status: 'ACTIVE' }],
    });
    expect(categories.listForProduct).toHaveBeenCalledWith('product-1');
  });
});
