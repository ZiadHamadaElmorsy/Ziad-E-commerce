import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PagesService } from '../services/pages.service';
import { CreatePageDto } from '../dto/create-page.dto';
import { UpdatePageDto } from '../dto/update-page.dto';
import { ListPagesQueryDto } from '../dto/list-pages-query.dto';

/**
 * Page API (docs/API-SPEC.md §25 "CMS API — Pages").
 *
 * Thin controller; every route is authenticated + tenant-scoped.
 */
@Controller('pages')
export class PagesController {
  constructor(private readonly pages: PagesService) {}

  @Get()
  async list(@Query() query: ListPagesQueryDto) {
    const { items, meta } = await this.pages.list(query);
    return { data: items, meta };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreatePageDto) {
    const page = await this.pages.create(dto);
    return { data: page };
  }

  @Get(':pageId')
  async get(@Param('pageId') pageId: string) {
    const page = await this.pages.get(pageId);
    return { data: page };
  }

  @Patch(':pageId')
  async update(@Param('pageId') pageId: string, @Body() dto: UpdatePageDto) {
    const page = await this.pages.update(pageId, dto);
    return { data: page };
  }

  @Post(':pageId/archive')
  @HttpCode(HttpStatus.OK)
  async archive(@Param('pageId') pageId: string) {
    const page = await this.pages.archive(pageId);
    return { data: page };
  }
}
