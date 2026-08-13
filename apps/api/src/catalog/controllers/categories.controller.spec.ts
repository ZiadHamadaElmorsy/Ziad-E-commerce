import 'reflect-metadata';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { ListCategoriesQueryDto } from '../dto/list-categories-query.dto';
import { UpdateCategoryDto } from '../dto/update-category.dto';
import { CategoriesService } from '../services/categories.service';
import { CategoriesController } from './categories.controller';

describe('CategoriesController', () => {
  let categories: {
    list: jest.Mock;
    create: jest.Mock;
    get: jest.Mock;
    update: jest.Mock;
    archive: jest.Mock;
  };
  let controller: CategoriesController;

  beforeEach(() => {
    categories = {
      list: jest.fn(),
      create: jest.fn(),
      get: jest.fn(),
      update: jest.fn(),
      archive: jest.fn(),
    };
    controller = new CategoriesController(categories as unknown as CategoriesService);
  });

  it('GET /categories delegates to the service and wraps the result in the data/meta envelope', async () => {
    categories.list.mockResolvedValue({
      items: [{ id: 'category-1' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    const result = await controller.list(new ListCategoriesQueryDto());

    expect(result).toEqual({
      data: [{ id: 'category-1' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });

  it('POST /categories delegates to the service', async () => {
    categories.create.mockResolvedValue({ id: 'category-1' });

    const dto = new CreateCategoryDto();
    dto.name = 'T-Shirts';

    expect(await controller.create(dto)).toEqual({ data: { id: 'category-1' } });
    expect(categories.create).toHaveBeenCalledWith(dto);
  });

  it('GET /categories/:categoryId delegates to the service', async () => {
    categories.get.mockResolvedValue({ id: 'category-1' });

    expect(await controller.get('category-1')).toEqual({ data: { id: 'category-1' } });
  });

  it('PATCH /categories/:categoryId delegates to the service', async () => {
    categories.update.mockResolvedValue({ id: 'category-1', name: 'Updated' });

    const dto = new UpdateCategoryDto();
    dto.name = 'Updated';

    expect(await controller.update('category-1', dto)).toEqual({
      data: { id: 'category-1', name: 'Updated' },
    });
  });

  it('POST /categories/:categoryId/archive delegates to the service', async () => {
    categories.archive.mockResolvedValue({ id: 'category-1', status: 'ARCHIVED' });

    expect(await controller.archive('category-1')).toEqual({
      data: { id: 'category-1', status: 'ARCHIVED' },
    });
  });
});
