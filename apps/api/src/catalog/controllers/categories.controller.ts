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
import { CategoriesService } from '../services/categories.service';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { UpdateCategoryDto } from '../dto/update-category.dto';
import { ListCategoriesQueryDto } from '../dto/list-categories-query.dto';

/**
 * Category API (docs/API-SPEC.md §18 "Category API").
 *
 * Thin controller; every route is authenticated + tenant-scoped.
 */
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  async list(@Query() query: ListCategoriesQueryDto) {
    const { items, meta } = await this.categories.list(query);
    return { data: items, meta };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateCategoryDto) {
    const category = await this.categories.create(dto);
    return { data: category };
  }

  @Get(':categoryId')
  async get(@Param('categoryId') categoryId: string) {
    const category = await this.categories.get(categoryId);
    return { data: category };
  }

  @Patch(':categoryId')
  async update(@Param('categoryId') categoryId: string, @Body() dto: UpdateCategoryDto) {
    const category = await this.categories.update(categoryId, dto);
    return { data: category };
  }

  @Post(':categoryId/archive')
  @HttpCode(HttpStatus.OK)
  async archive(@Param('categoryId') categoryId: string) {
    const category = await this.categories.archive(categoryId);
    return { data: category };
  }
}
