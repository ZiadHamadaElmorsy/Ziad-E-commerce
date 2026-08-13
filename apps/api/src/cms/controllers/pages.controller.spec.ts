import 'reflect-metadata';
import { CreatePageDto } from '../dto/create-page.dto';
import { ListPagesQueryDto } from '../dto/list-pages-query.dto';
import { UpdatePageDto } from '../dto/update-page.dto';
import { PagesService } from '../services/pages.service';
import { PagesController } from './pages.controller';

describe('PagesController', () => {
  let pages: {
    list: jest.Mock;
    create: jest.Mock;
    get: jest.Mock;
    update: jest.Mock;
    archive: jest.Mock;
  };
  let controller: PagesController;

  beforeEach(() => {
    pages = {
      list: jest.fn(),
      create: jest.fn(),
      get: jest.fn(),
      update: jest.fn(),
      archive: jest.fn(),
    };
    controller = new PagesController(pages as unknown as PagesService);
  });

  it('GET /pages delegates to the service and wraps the result in the data/meta envelope', async () => {
    pages.list.mockResolvedValue({
      items: [{ id: 'page-1' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    const result = await controller.list(new ListPagesQueryDto());

    expect(result).toEqual({
      data: [{ id: 'page-1' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });

  it('POST /pages delegates to the service', async () => {
    pages.create.mockResolvedValue({ id: 'page-1' });

    const dto = new CreatePageDto();
    dto.title = 'About';

    expect(await controller.create(dto)).toEqual({ data: { id: 'page-1' } });
    expect(pages.create).toHaveBeenCalledWith(dto);
  });

  it('GET /pages/:pageId delegates to the service', async () => {
    pages.get.mockResolvedValue({ id: 'page-1' });

    expect(await controller.get('page-1')).toEqual({ data: { id: 'page-1' } });
  });

  it('PATCH /pages/:pageId delegates to the service', async () => {
    pages.update.mockResolvedValue({ id: 'page-1', title: 'Updated' });

    const dto = new UpdatePageDto();
    dto.title = 'Updated';

    expect(await controller.update('page-1', dto)).toEqual({
      data: { id: 'page-1', title: 'Updated' },
    });
  });

  it('POST /pages/:pageId/archive delegates to the service', async () => {
    pages.archive.mockResolvedValue({ id: 'page-1', status: 'ARCHIVED' });

    expect(await controller.archive('page-1')).toEqual({
      data: { id: 'page-1', status: 'ARCHIVED' },
    });
  });
});
