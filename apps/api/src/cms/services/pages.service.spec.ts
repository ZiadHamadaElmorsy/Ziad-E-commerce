import { PageStatus } from '@prisma/client';
import { RequestContextService } from '../../common/context/request-context.service';
import {
  NotFoundError,
  StateTransitionError,
  TenantContextRequiredError,
  ValidationError,
} from '../../common/errors/domain-exceptions';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { CreatePageDto } from '../dto/create-page.dto';
import { ListPagesQueryDto } from '../dto/list-pages-query.dto';
import { UpdatePageDto } from '../dto/update-page.dto';
import { PageRepository } from '../repositories/page.repository';
import { PagesService } from './pages.service';

describe('PagesService', () => {
  let requestContext: { getCurrent: jest.Mock };
  let pages: {
    create: jest.Mock;
    updateGuarded: jest.Mock;
    existsBySlug: jest.Mock;
    findById: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
  };
  let transaction: { run: jest.Mock; runWithTenant: jest.Mock };
  let service: PagesService;

  const pageRow = {
    id: 'page-1',
    storeId: 'store-1',
    title: 'About',
    slug: 'about',
    status: PageStatus.DRAFT,
    seoTitle: null,
    seoDescription: null,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
    sections: [],
  };

  beforeEach(() => {
    requestContext = { getCurrent: jest.fn() };
    pages = {
      create: jest.fn(),
      updateGuarded: jest.fn(),
      existsBySlug: jest.fn(),
      findById: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    };
    transaction = { run: jest.fn(), runWithTenant: jest.fn() };

    transaction.runWithTenant.mockImplementation(
      async (_storeId: string, work: (tx: unknown) => Promise<unknown>) => work({}),
    );

    service = new PagesService(
      requestContext as unknown as RequestContextService,
      pages as unknown as PageRepository,
      transaction as unknown as TransactionService,
    );
  });

  function withTenant(): void {
    requestContext.getCurrent.mockReturnValue({
      requestId: 'req-1',
      store: { id: 'store-1', slug: 'my-store', name: 'My Store', status: 'ACTIVE' },
    });
  }

  function createDto(overrides: Partial<CreatePageDto> = {}): CreatePageDto {
    return { title: 'About Us', ...overrides };
  }

  function listQuery(overrides: Partial<ListPagesQueryDto> = {}): ListPagesQueryDto {
    return { page: 1, limit: 20, ...overrides };
  }

  describe('create', () => {
    it('requires a store tenant context', async () => {
      await expect(service.create(createDto())).rejects.toBeInstanceOf(TenantContextRequiredError);
    });

    it('creates a DRAFT page with a slug generated from the title', async () => {
      withTenant();
      pages.existsBySlug.mockResolvedValue(false);
      pages.create.mockResolvedValue(pageRow);

      const result = await service.create(createDto());

      expect(pages.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ storeId: 'store-1', title: 'About Us', slug: 'about-us' }),
      );
      expect(result).toMatchObject({ id: 'page-1', title: 'About', slug: 'about' });
      expect(result.status).toBe(PageStatus.DRAFT);
    });

    it('resolves slug collisions with -2, -3 suffixes (store-scoped)', async () => {
      withTenant();
      pages.existsBySlug
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      pages.create.mockResolvedValue({ ...pageRow, slug: 'about-us-3' });

      await service.create(createDto());

      expect(pages.existsBySlug).toHaveBeenCalledWith(expect.anything(), 'store-1', 'about-us');
      expect(pages.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ slug: 'about-us-3' }),
      );
    });

    it('rejects a title that cannot produce a URL-safe slug', async () => {
      withTenant();
      await expect(service.create(createDto({ title: '!!!' }))).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(pages.create).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('returns the store-scoped collection with pagination metadata', async () => {
      withTenant();
      pages.findMany.mockResolvedValue([pageRow]);
      pages.count.mockResolvedValue(1);

      const result = await service.list(listQuery());

      expect(pages.findMany).toHaveBeenCalledWith(
        'store-1',
        expect.objectContaining({ skip: 0, take: 20 }),
      );
      expect(result.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
      expect(result.items).toHaveLength(1);
    });

    it('computes skip from page/limit', async () => {
      withTenant();
      pages.findMany.mockResolvedValue([]);
      pages.count.mockResolvedValue(0);

      await service.list(listQuery({ page: 3, limit: 10 }));

      expect(pages.findMany).toHaveBeenCalledWith(
        'store-1',
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });
  });

  describe('get', () => {
    it('returns the store-scoped page with its sections in defined order', async () => {
      withTenant();
      pages.findById.mockResolvedValue({
        ...pageRow,
        sections: [{ id: 'section-1', sortOrder: 0, sectionType: 'text', content: {} }],
      });

      const result = await service.get('page-1');

      expect(pages.findById).toHaveBeenCalledWith('store-1', 'page-1');
      expect(result.sections).toHaveLength(1);
    });

    it('fails closed with NOT_FOUND for a missing/foreign page', async () => {
      withTenant();
      pages.findById.mockResolvedValue(null);

      await expect(service.get('page-999')).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('update', () => {
    it('updates fields without changing the status', async () => {
      withTenant();
      pages.findById
        .mockResolvedValueOnce(pageRow)
        .mockResolvedValueOnce({ ...pageRow, title: 'Updated' });
      pages.updateGuarded.mockResolvedValue({ count: 1 });

      const dto = new UpdatePageDto();
      dto.title = 'Updated';

      const result = await service.update('page-1', dto);

      expect(pages.updateGuarded).toHaveBeenCalledWith(
        expect.anything(),
        'store-1',
        'page-1',
        PageStatus.DRAFT,
        expect.objectContaining({ status: PageStatus.DRAFT, title: 'Updated' }),
      );
      expect(result.title).toBe('Updated');
    });

    it('publishes a DRAFT page (status DRAFT -> PUBLISHED)', async () => {
      withTenant();
      pages.findById
        .mockResolvedValueOnce(pageRow)
        .mockResolvedValueOnce({ ...pageRow, status: PageStatus.PUBLISHED });
      pages.updateGuarded.mockResolvedValue({ count: 1 });

      const dto = new UpdatePageDto();
      dto.status = PageStatus.PUBLISHED;

      const result = await service.update('page-1', dto);

      expect(pages.updateGuarded).toHaveBeenCalledWith(
        expect.anything(),
        'store-1',
        'page-1',
        PageStatus.DRAFT,
        expect.objectContaining({ status: PageStatus.PUBLISHED }),
      );
      expect(result.status).toBe(PageStatus.PUBLISHED);
    });

    it('unpublishes a PUBLISHED page (status PUBLISHED -> DRAFT)', async () => {
      withTenant();
      pages.findById
        .mockResolvedValueOnce({ ...pageRow, status: PageStatus.PUBLISHED })
        .mockResolvedValueOnce(pageRow);
      pages.updateGuarded.mockResolvedValue({ count: 1 });

      const dto = new UpdatePageDto();
      dto.status = PageStatus.DRAFT;

      const result = await service.update('page-1', dto);

      expect(result.status).toBe(PageStatus.DRAFT);
    });

    it('is an idempotent no-op when nothing changes', async () => {
      withTenant();
      pages.findById.mockResolvedValue(pageRow);

      const result = await service.update('page-1', new UpdatePageDto());

      expect(result).toMatchObject({ id: 'page-1' });
      expect(pages.updateGuarded).not.toHaveBeenCalled();
    });

    it('fails with NOT_FOUND for a missing page', async () => {
      withTenant();
      pages.findById.mockResolvedValue(null);

      await expect(service.update('page-999', new UpdatePageDto())).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('fails with STATE_TRANSITION when the guarded update affects zero rows', async () => {
      withTenant();
      pages.findById.mockResolvedValue(pageRow);
      pages.updateGuarded.mockResolvedValue({ count: 0 });

      const dto = new UpdatePageDto();
      dto.status = PageStatus.PUBLISHED;

      await expect(service.update('page-1', dto)).rejects.toBeInstanceOf(StateTransitionError);
    });
  });

  describe('archive', () => {
    it('archives a DRAFT page (DRAFT -> ARCHIVED)', async () => {
      withTenant();
      pages.findById
        .mockResolvedValueOnce(pageRow)
        .mockResolvedValueOnce({ ...pageRow, status: PageStatus.ARCHIVED });
      pages.updateGuarded.mockResolvedValue({ count: 1 });

      const result = await service.archive('page-1');

      expect(pages.updateGuarded).toHaveBeenCalledWith(
        expect.anything(),
        'store-1',
        'page-1',
        PageStatus.DRAFT,
        { status: PageStatus.ARCHIVED },
      );
      expect(result.status).toBe(PageStatus.ARCHIVED);
    });

    it('fails with NOT_FOUND for a missing page', async () => {
      withTenant();
      pages.findById.mockResolvedValue(null);

      await expect(service.archive('page-999')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('rejects archiving an already-archived page (terminal state)', async () => {
      withTenant();
      pages.findById.mockResolvedValue({ ...pageRow, status: PageStatus.ARCHIVED });

      await expect(service.archive('page-1')).rejects.toBeInstanceOf(StateTransitionError);
    });

    it('fails with STATE_TRANSITION when a concurrent request transitioned the page first', async () => {
      withTenant();
      pages.findById.mockResolvedValue(pageRow);
      pages.updateGuarded.mockResolvedValue({ count: 0 });

      await expect(service.archive('page-1')).rejects.toBeInstanceOf(StateTransitionError);
    });
  });
});
