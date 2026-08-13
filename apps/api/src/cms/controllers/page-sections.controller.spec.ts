import 'reflect-metadata';
import { CreatePageSectionDto } from '../dto/create-page-section.dto';
import { ReorderPageSectionsDto } from '../dto/reorder-page-sections.dto';
import { UpdatePageSectionDto } from '../dto/update-page-section.dto';
import { PageSectionsService } from '../services/page-sections.service';
import { PageSectionsController } from './page-sections.controller';

describe('PageSectionsController', () => {
  let sections: {
    addSection: jest.Mock;
    updateSection: jest.Mock;
    deleteSection: jest.Mock;
    reorderSections: jest.Mock;
  };
  let controller: PageSectionsController;

  beforeEach(() => {
    sections = {
      addSection: jest.fn(),
      updateSection: jest.fn(),
      deleteSection: jest.fn(),
      reorderSections: jest.fn(),
    };
    controller = new PageSectionsController(sections as unknown as PageSectionsService);
  });

  it('POST /pages/:pageId/sections delegates to the service', async () => {
    sections.addSection.mockResolvedValue({ id: 'section-1' });

    const dto = new CreatePageSectionDto();
    dto.type = 'HERO';
    dto.position = 0;
    dto.content = {};

    expect(await controller.add('page-1', dto)).toEqual({ data: { id: 'section-1' } });
    expect(sections.addSection).toHaveBeenCalledWith('page-1', dto);
  });

  it('PATCH /pages/:pageId/sections/:sectionId delegates to the service', async () => {
    sections.updateSection.mockResolvedValue({ id: 'section-1', sectionType: 'text' });

    const dto = new UpdatePageSectionDto();
    dto.content = { body: 'Hello' };

    expect(await controller.update('page-1', 'section-1', dto)).toEqual({
      data: { id: 'section-1', sectionType: 'text' },
    });
    expect(sections.updateSection).toHaveBeenCalledWith('page-1', 'section-1', dto);
  });

  it('DELETE /pages/:pageId/sections/:sectionId delegates to the service', async () => {
    sections.deleteSection.mockResolvedValue(undefined);

    await expect(controller.remove('page-1', 'section-1')).resolves.toBeUndefined();
    expect(sections.deleteSection).toHaveBeenCalledWith('page-1', 'section-1');
  });

  it('POST /pages/:pageId/sections/reorder delegates to the service', async () => {
    sections.reorderSections.mockResolvedValue([{ id: 'section-3' }]);

    const dto = new ReorderPageSectionsDto();
    dto.sectionIds = ['section-3'];

    expect(await controller.reorder('page-1', dto)).toEqual({ data: [{ id: 'section-3' }] });
    expect(sections.reorderSections).toHaveBeenCalledWith('page-1', dto);
  });
});
