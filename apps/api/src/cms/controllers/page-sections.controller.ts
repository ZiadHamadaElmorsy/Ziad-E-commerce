import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { PageSectionsService } from '../services/page-sections.service';
import { CreatePageSectionDto } from '../dto/create-page-section.dto';
import { UpdatePageSectionDto } from '../dto/update-page-section.dto';
import { ReorderPageSectionsDto } from '../dto/reorder-page-sections.dto';

/**
 * Page Section API (docs/API-SPEC.md §26 "Page Sections").
 *
 * Thin controller; every route is authenticated + tenant-scoped and resolves
 * the owning Page from the trusted tenant context.
 */
@Controller('pages/:pageId/sections')
export class PageSectionsController {
  constructor(private readonly sections: PageSectionsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async add(@Param('pageId') pageId: string, @Body() dto: CreatePageSectionDto) {
    const section = await this.sections.addSection(pageId, dto);
    return { data: section };
  }

  @Patch(':sectionId')
  async update(
    @Param('pageId') pageId: string,
    @Param('sectionId') sectionId: string,
    @Body() dto: UpdatePageSectionDto,
  ) {
    const section = await this.sections.updateSection(pageId, sectionId, dto);
    return { data: section };
  }

  @Delete(':sectionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('pageId') pageId: string, @Param('sectionId') sectionId: string) {
    await this.sections.deleteSection(pageId, sectionId);
  }

  @Post('reorder')
  @HttpCode(HttpStatus.OK)
  async reorder(@Param('pageId') pageId: string, @Body() dto: ReorderPageSectionsDto) {
    const sections = await this.sections.reorderSections(pageId, dto);
    return { data: sections };
  }
}
