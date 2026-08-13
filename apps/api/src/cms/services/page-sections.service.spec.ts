import { PageStatus } from '@prisma/client';
import { RequestContextService } from '../../common/context/request-context.service';
import {
  NotFoundError,
  TenantContextRequiredError,
  ValidationError,
} from '../../common/errors/domain-exceptions';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { CreatePageSectionDto } from '../dto/create-page-section.dto';
import { ReorderPageSectionsDto } from '../dto/reorder-page-sections.dto';
import { UpdatePageSectionDto } from '../dto/update-page-section.dto';
import { PageRepository } from '../repositories/page.repository';
import { PageSectionRepository } from '../repositories/page-section.repository';
import { orderedAfterMove, PageSectionsService } from './page-sections.service';

describe('PageSectionsService', () => {
  let requestContext: { getCurrent: jest.Mock };
  let pages: { findById: jest.Mock };
  let sections: {
    create: jest.Mock;
    shiftUpFrom: jest.Mock;
    updateGuarded: jest.Mock;
    delete: jest.Mock;
    findByPage: jest.Mock;
    findById: jest.Mock;
    applyOrders: jest.Mock;
  };
  let transaction: { run: jest.Mock; runWithTenant: jest.Mock };
  let service: PageSectionsService;

  const pageRow = {
    id: 'page-1',
    storeId: 'store-1',
    title: 'Home',
    slug: 'home',
    status: PageStatus.DRAFT,
    seoTitle: null,
    seoDescription: null,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
    sections: [],
  };

  const sectionRows = [
    {
      id: 'section-1',
      storeId: 'store-1',
      pageId: 'page-1',
      sectionType: 'hero',
      content: { title: 'Hero' },
      sortOrder: 0,
      createdAt: new Date('2026-08-12T00:00:00Z'),
      updatedAt: new Date('2026-08-12T00:00:00Z'),
    },
    {
      id: 'section-2',
      storeId: 'store-1',
      pageId: 'page-1',
      sectionType: 'text',
      content: { body: 'Hello' },
      sortOrder: 1,
      createdAt: new Date('2026-08-12T00:00:00Z'),
      updatedAt: new Date('2026-08-12T00:00:00Z'),
    },
    {
      id: 'section-3',
      storeId: 'store-1',
      pageId: 'page-1',
      sectionType: 'image',
      content: {},
      sortOrder: 2,
      createdAt: new Date('2026-08-12T00:00:00Z'),
      updatedAt: new Date('2026-08-12T00:00:00Z'),
    },
  ];

  beforeEach(() => {
    requestContext = { getCurrent: jest.fn() };
    pages = { findById: jest.fn() };
    sections = {
      create: jest.fn(),
      shiftUpFrom: jest.fn(),
      updateGuarded: jest.fn(),
      delete: jest.fn(),
      findByPage: jest.fn(),
      findById: jest.fn(),
      applyOrders: jest.fn(),
    };
    transaction = { run: jest.fn(), runWithTenant: jest.fn() };

    transaction.runWithTenant.mockImplementation(
      async (_storeId: string, work: (tx: unknown) => Promise<unknown>) => work({}),
    );

    service = new PageSectionsService(
      requestContext as unknown as RequestContextService,
      pages as unknown as PageRepository,
      sections as unknown as PageSectionRepository,
      transaction as unknown as TransactionService,
    );
  });

  function withTenant(): void {
    requestContext.getCurrent.mockReturnValue({
      requestId: 'req-1',
      store: { id: 'store-1', slug: 'my-store', name: 'My Store', status: 'ACTIVE' },
    });
  }

  function addDto(overrides: Partial<CreatePageSectionDto> = {}): CreatePageSectionDto {
    return { type: 'HERO', position: 0, content: { title: 'Hero' }, ...overrides };
  }

  describe('addSection', () => {
    it('requires a store tenant context', async () => {
      await expect(service.addSection('page-1', addDto())).rejects.toBeInstanceOf(
        TenantContextRequiredError,
      );
    });

    it('fails with NOT_FOUND when the page does not exist in the store', async () => {
      withTenant();
      pages.findById.mockResolvedValue(null);

      await expect(service.addSection('page-999', addDto())).rejects.toBeInstanceOf(NotFoundError);
      expect(sections.create).not.toHaveBeenCalled();
    });

    it('inserts a section at the given position, shifting following sections', async () => {
      withTenant();
      pages.findById.mockResolvedValue(pageRow);
      sections.create.mockResolvedValue({
        ...sectionRows[0],
        id: 'section-new',
        sectionType: 'hero',
      });

      const result = await service.addSection('page-1', addDto());

      expect(sections.shiftUpFrom).toHaveBeenCalledWith(expect.anything(), 'store-1', 'page-1', 0);
      expect(sections.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          storeId: 'store-1',
          pageId: 'page-1',
          sectionType: 'hero',
          sortOrder: 0,
          content: { title: 'Hero' },
        }),
      );
      expect(result.sectionType).toBe('hero');
    });

    it('maps the API section type to the lowercase database value', async () => {
      withTenant();
      pages.findById.mockResolvedValue(pageRow);
      sections.create.mockResolvedValue({ ...sectionRows[0], sectionType: 'featured_products' });

      await service.addSection('page-1', addDto({ type: 'FEATURED_PRODUCTS' }));

      expect(sections.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ sectionType: 'featured_products' }),
      );
    });

    it('rejects a non-object content', async () => {
      withTenant();
      pages.findById.mockResolvedValue(pageRow);

      await expect(
        service.addSection(
          'page-1',
          addDto({ content: 'bad' as unknown as Record<string, unknown> }),
        ),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(sections.create).not.toHaveBeenCalled();
    });
  });

  describe('updateSection', () => {
    it('updates section fields without changing the order', async () => {
      withTenant();
      pages.findById.mockResolvedValue(pageRow);
      sections.findById
        .mockResolvedValueOnce(sectionRows[0])
        .mockResolvedValueOnce({ ...sectionRows[0], content: { title: 'New' } });
      sections.updateGuarded.mockResolvedValue({ count: 1 });

      const dto = new UpdatePageSectionDto();
      dto.content = { title: 'New' };

      const result = await service.updateSection('page-1', 'section-1', dto);

      expect(sections.updateGuarded).toHaveBeenCalledWith(
        expect.anything(),
        'store-1',
        'page-1',
        'section-1',
        expect.objectContaining({ content: { title: 'New' } }),
      );
      expect(result.content).toEqual({ title: 'New' });
      expect(sections.applyOrders).not.toHaveBeenCalled();
    });

    it('moves the section to the requested position (defined order stays dense)', async () => {
      withTenant();
      pages.findById.mockResolvedValue(pageRow);
      sections.findById.mockResolvedValueOnce(sectionRows[2]).mockResolvedValueOnce(sectionRows[2]);
      sections.findByPage.mockResolvedValue(sectionRows);

      const dto = new UpdatePageSectionDto();
      dto.position = 0;

      const result = await service.updateSection('page-1', 'section-3', dto);

      expect(sections.applyOrders).toHaveBeenCalledWith(expect.anything(), 'store-1', 'page-1', [
        { id: 'section-3', sortOrder: 0 },
        { id: 'section-1', sortOrder: 1 },
        { id: 'section-2', sortOrder: 2 },
      ]);
      expect(result.id).toBe('section-3');
    });

    it('fails with NOT_FOUND when the section is not in the page', async () => {
      withTenant();
      pages.findById.mockResolvedValue(pageRow);
      sections.findById.mockResolvedValue(null);

      await expect(
        service.updateSection('page-1', 'section-999', new UpdatePageSectionDto()),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('deleteSection', () => {
    it('deletes a section of the page', async () => {
      withTenant();
      pages.findById.mockResolvedValue(pageRow);
      sections.delete.mockResolvedValue({ count: 1 });

      await expect(service.deleteSection('page-1', 'section-1')).resolves.toBeUndefined();

      expect(sections.delete).toHaveBeenCalledWith(
        expect.anything(),
        'store-1',
        'page-1',
        'section-1',
      );
    });

    it('fails with NOT_FOUND when the section does not exist', async () => {
      withTenant();
      pages.findById.mockResolvedValue(pageRow);
      sections.delete.mockResolvedValue({ count: 0 });

      await expect(service.deleteSection('page-1', 'section-999')).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe('reorderSections', () => {
    it('applies the full new order', async () => {
      withTenant();
      pages.findById.mockResolvedValue(pageRow);
      sections.findByPage
        .mockResolvedValueOnce(sectionRows)
        .mockResolvedValueOnce([sectionRows[2], sectionRows[0], sectionRows[1]]);

      const dto = new ReorderPageSectionsDto();
      dto.sectionIds = ['section-3', 'section-1', 'section-2'];

      const result = await service.reorderSections('page-1', dto);

      expect(sections.applyOrders).toHaveBeenCalledWith(expect.anything(), 'store-1', 'page-1', [
        { id: 'section-3', sortOrder: 0 },
        { id: 'section-1', sortOrder: 1 },
        { id: 'section-2', sortOrder: 2 },
      ]);
      expect(result).toHaveLength(3);
    });

    it('rejects a reorder that does not cover every section', async () => {
      withTenant();
      pages.findById.mockResolvedValue(pageRow);
      sections.findByPage.mockResolvedValue(sectionRows);

      const dto = new ReorderPageSectionsDto();
      dto.sectionIds = ['section-1', 'section-2'];

      await expect(service.reorderSections('page-1', dto)).rejects.toBeInstanceOf(ValidationError);
      expect(sections.applyOrders).not.toHaveBeenCalled();
    });

    it('rejects duplicate section ids', async () => {
      withTenant();
      pages.findById.mockResolvedValue(pageRow);
      sections.findByPage.mockResolvedValue(sectionRows);

      const dto = new ReorderPageSectionsDto();
      dto.sectionIds = ['section-1', 'section-1', 'section-2'];

      await expect(service.reorderSections('page-1', dto)).rejects.toBeInstanceOf(ValidationError);
    });

    it('fails with NOT_FOUND when the page does not exist', async () => {
      withTenant();
      pages.findById.mockResolvedValue(null);

      const dto = new ReorderPageSectionsDto();
      dto.sectionIds = [];

      await expect(service.reorderSections('page-999', dto)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('orderedAfterMove', () => {
    it('moves a section to the front', () => {
      const result = orderedAfterMove(sectionRows, 'section-3', 0);
      expect(result.map((o) => o.id)).toEqual(['section-3', 'section-1', 'section-2']);
      expect(result.map((o) => o.sortOrder)).toEqual([0, 1, 2]);
    });

    it('clamps positions outside the valid range', () => {
      const result = orderedAfterMove(sectionRows, 'section-1', 99);
      expect(result.map((o) => o.id)).toEqual(['section-2', 'section-3', 'section-1']);
    });
  });
});
