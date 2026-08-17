import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { ListStorefrontCategoriesQueryDto } from '../dto/list-storefront-categories-query.dto';
import { ListStorefrontProductMediaQueryDto } from '../dto/list-storefront-product-media-query.dto';
import { ListStorefrontProductsQueryDto } from '../dto/list-storefront-products-query.dto';
import { StorefrontService } from '../services/storefront.service';

/**
 * Public Storefront API (docs/API-SPEC.md §31) — the exact documented endpoints:
 *
 *   GET /api/v1/storefront
 *   GET /api/v1/storefront/products
 *   GET /api/v1/storefront/products/:slug
 *   GET /api/v1/storefront/products/:slug/media   (Phase 26 — paginated gallery)
 *   GET /api/v1/storefront/categories
 *   GET /api/v1/storefront/categories/:slug
 *   GET /api/v1/storefront/pages/:slug
 *
 * All routes are @Public() (anonymous, no merchant session). The Store is
 * resolved by StorefrontStoreResolver from the public storefront slug/domain —
 * never from a client-supplied Store ID (DATABASE §5.4). No endpoint in this
 * controller writes data.
 */
@Controller('storefront')
export class StorefrontController {
  constructor(private readonly storefrontService: StorefrontService) {}

  @Public()
  @Get()
  async getStore(@Req() request: Request) {
    const store = await this.storefrontService.getStore(request);
    return { data: store };
  }

  @Public()
  @Get('products')
  async listProducts(@Req() request: Request, @Query() query: ListStorefrontProductsQueryDto) {
    const { items, meta } = await this.storefrontService.listProducts(request, query);
    return { data: items, meta };
  }

  @Public()
  @Get('products/:slug')
  async getProductBySlug(@Req() request: Request, @Param('slug') slug: string) {
    const product = await this.storefrontService.getProductBySlug(request, slug);
    return { data: product };
  }

  @Public()
  @Get('products/:slug/media')
  async getProductMedia(
    @Req() request: Request,
    @Param('slug') slug: string,
    @Query() query: ListStorefrontProductMediaQueryDto,
  ) {
    const { items, meta } = await this.storefrontService.listProductMedia(request, slug, query);
    return { data: items, meta };
  }

  @Public()
  @Get('categories')
  async listCategories(@Req() request: Request, @Query() query: ListStorefrontCategoriesQueryDto) {
    const { items, meta } = await this.storefrontService.listCategories(request, query);
    return { data: items, meta };
  }

  @Public()
  @Get('categories/:slug')
  async getCategoryBySlug(
    @Req() request: Request,
    @Param('slug') slug: string,
    @Query() query: ListStorefrontCategoriesQueryDto,
  ) {
    const category = await this.storefrontService.getCategoryBySlug(request, slug, query);
    return { data: category };
  }

  @Public()
  @Get('pages/:slug')
  async getPageBySlug(@Req() request: Request, @Param('slug') slug: string) {
    const page = await this.storefrontService.getPageBySlug(request, slug);
    return { data: page };
  }
}
