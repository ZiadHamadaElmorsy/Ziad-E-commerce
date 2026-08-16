import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ProductsService } from '../services/products.service';
import { VariantsService } from '../services/variants.service';
import { CategoriesService } from '../services/categories.service';
import { CreateProductDto } from '../dto/create-product.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { ListProductsQueryDto } from '../dto/list-products-query.dto';
import { CreateVariantDto } from '../dto/create-variant.dto';

/**
 * Product + nested Variant + nested Category-link API
 * (docs/API-SPEC.md §16 "Product API", §17 nested variant routes, §18 assign /
 * remove product-category routes).
 *
 * Thin controller: all business logic lives in the services. Every route is
 * authenticated + tenant-scoped through the global guard chain; the trusted
 * store comes from the resolved tenant context, never from client input.
 */
@Controller('products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly variants: VariantsService,
    private readonly categories: CategoriesService,
  ) {}

  @Get()
  async list(@Query() query: ListProductsQueryDto) {
    const { items, meta } = await this.products.list(query);
    return { data: items, meta };
  }

  @Get(':productId')
  async get(@Param('productId') productId: string) {
    const product = await this.products.get(productId);
    return { data: product };
  }

  @Get(':productId/categories')
  async listCategories(@Param('productId') productId: string) {
    const categories = await this.categories.listForProduct(productId);
    return { data: categories };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateProductDto) {
    const product = await this.products.create(dto);
    return { data: product };
  }

  @Patch(':productId')
  async update(@Param('productId') productId: string, @Body() dto: UpdateProductDto) {
    const product = await this.products.update(productId, dto);
    return { data: product };
  }

  @Post(':productId/media/:mediaId')
  @HttpCode(HttpStatus.CREATED)
  async attachMedia(@Param('productId') productId: string, @Param('mediaId') mediaId: string) {
    const product = await this.products.attachMedia(productId, mediaId);
    return { data: product };
  }

  @Delete(':productId/media/:mediaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMedia(@Param('productId') productId: string, @Param('mediaId') mediaId: string) {
    await this.products.removeMedia(productId, mediaId);
  }

  @Post(':productId/publish')
  @HttpCode(HttpStatus.OK)
  async publish(@Param('productId') productId: string) {
    const product = await this.products.publish(productId);
    return { data: product };
  }

  @Post(':productId/unpublish')
  @HttpCode(HttpStatus.OK)
  async unpublish(@Param('productId') productId: string) {
    const product = await this.products.unpublish(productId);
    return { data: product };
  }

  @Post(':productId/archive')
  @HttpCode(HttpStatus.OK)
  async archive(@Param('productId') productId: string) {
    const product = await this.products.archive(productId);
    return { data: product };
  }

  // --- Variants (docs/API-SPEC.md §17) ---

  @Get(':productId/variants')
  async listVariants(@Param('productId') productId: string) {
    const variants = await this.variants.listByProduct(productId);
    return { data: variants };
  }

  @Post(':productId/variants')
  @HttpCode(HttpStatus.CREATED)
  async createVariant(@Param('productId') productId: string, @Body() dto: CreateVariantDto) {
    const variant = await this.variants.create(productId, dto);
    return { data: variant };
  }

  // --- ProductCategory links (docs/API-SPEC.md §18) ---

  @Post(':productId/categories/:categoryId')
  @HttpCode(HttpStatus.CREATED)
  async assignCategory(
    @Param('productId') productId: string,
    @Param('categoryId') categoryId: string,
  ) {
    const link = await this.categories.assignProduct(productId, categoryId);
    return { data: link };
  }

  @Delete(':productId/categories/:categoryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeCategory(
    @Param('productId') productId: string,
    @Param('categoryId') categoryId: string,
  ): Promise<void> {
    await this.categories.removeProductFromCategory(productId, categoryId);
  }
}
