import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import {
  buildPaginationMeta,
  PaginatedView,
  StorefrontCategoryDetailView,
  StorefrontCategoryView,
  StorefrontPageView,
  StorefrontProductView,
  StorefrontStoreView,
  toStorefrontCategoryView,
  toStorefrontPageView,
  toStorefrontProductView,
  toStorefrontStoreView,
} from '../storefront.types';
import { isPaymobConfigured } from '../../config/payment-config';
import { isWhatsAppAvailable } from '../../store-settings/domain/whatsapp-config';
import { StoreSettingsService } from '../../store-settings/services/store-settings.service';
import { NotFoundError } from '../../common/errors/domain-exceptions';
import { ListStorefrontCategoriesQueryDto } from '../dto/list-storefront-categories-query.dto';
import { ListStorefrontProductsQueryDto } from '../dto/list-storefront-products-query.dto';
import { StorefrontRepository } from '../repositories/storefront.repository';
import { StorefrontStoreResolver } from './storefront-store-resolver';

/**
 * Storefront application service (docs/API-SPEC.md §31-§32, docs/DATABASE.md
 * §5.4/§29.6, docs/MVP-SCOPE.md §21-§23/§28).
 *
 * Public, anonymous, read-only. Business rules implemented here:
 *
 * - Store resolution comes from the public storefront slug/domain
 *   (StorefrontStoreResolver); a client-supplied Store ID is never accepted.
 * - Only ACTIVE products, ACTIVE (purchasable) variants, ACTIVE categories and
 *   PUBLISHED pages are exposed. DRAFT / ARCHIVED / non-ACTIVE data is never
 *   returned (mirrors the public RLS policy set).
 * - Availability is derived per variant (on_hand - reserved > 0); a variant
 *   without an inventory row is NOT available (fail closed, mirroring the
 *   Inventory "missing row is never rendered as zero" rule).
 * - Search filters by Product Name within the resolved Store (MVP-SCOPE §28,
 *   US-STF-004).
 * - Missing resources fail closed with NOT_FOUND (no existence leak).
 */
@Injectable()
export class StorefrontService {
  constructor(
    private readonly storeResolver: StorefrontStoreResolver,
    private readonly storefrontRepository: StorefrontRepository,
    private readonly settings: StoreSettingsService,
    private readonly config: ConfigService,
  ) {}

  /** GET /api/v1/storefront — public store configuration required for rendering. */
  async getStore(request: Pick<Request, 'headers'>): Promise<StorefrontStoreView> {
    const store = await this.storeResolver.resolve(request);
    const whatsapp = await this.settings.readWhatsAppSettings(store.id);
    return toStorefrontStoreView(store, {
      payOnline: isPaymobConfigured(this.config.get<{ apiKey?: string; integrationId?: string; publicKey?: string }>('paymob')),
      whatsapp: isWhatsAppAvailable(whatsapp)
        ? { enabled: true, phoneNumber: whatsapp.phoneNumber, label: whatsapp.label }
        : null,
    });
  }

  /** GET /api/v1/storefront/products — ACTIVE products with search + pagination. */
  async listProducts(
    request: Pick<Request, 'headers'>,
    query: ListStorefrontProductsQueryDto,
  ): Promise<PaginatedView<StorefrontProductView>> {
    const store = await this.storeResolver.resolve(request);
    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      this.storefrontRepository.findActiveProducts(store.id, {
        search: query.search,
        skip,
        take: query.limit,
      }),
      this.storefrontRepository.countActiveProducts(store.id, query.search),
    ]);

    return {
      items: items.map(toStorefrontProductView),
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  /** GET /api/v1/storefront/products/:slug — ACTIVE product by slug. */
  async getProductBySlug(
    request: Pick<Request, 'headers'>,
    slug: string,
  ): Promise<StorefrontProductView> {
    const store = await this.storeResolver.resolve(request);
    const product = await this.storefrontRepository.findActiveProductBySlug(store.id, slug);
    if (!product) {
      throw new NotFoundError('The product was not found.');
    }
    return toStorefrontProductView(product);
  }

  /** GET /api/v1/storefront/categories — ACTIVE categories with pagination. */
  async listCategories(
    request: Pick<Request, 'headers'>,
    query: ListStorefrontCategoriesQueryDto,
  ): Promise<PaginatedView<StorefrontCategoryView>> {
    const store = await this.storeResolver.resolve(request);
    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      this.storefrontRepository.findActiveCategories(store.id, { skip, take: query.limit }),
      this.storefrontRepository.countActiveCategories(store.id),
    ]);

    return {
      items: items.map(toStorefrontCategoryView),
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  /** GET /api/v1/storefront/categories/:slug — ACTIVE category + its ACTIVE products. */
  async getCategoryBySlug(
    request: Pick<Request, 'headers'>,
    slug: string,
    query: ListStorefrontCategoriesQueryDto,
  ): Promise<StorefrontCategoryDetailView> {
    const store = await this.storeResolver.resolve(request);
    const category = await this.storefrontRepository.findActiveCategoryBySlug(store.id, slug);
    if (!category) {
      throw new NotFoundError('The category was not found.');
    }

    const skip = (query.page - 1) * query.limit;
    const [products, total] = await Promise.all([
      this.storefrontRepository.findActiveProductsByCategory(store.id, category.id, {
        skip,
        take: query.limit,
      }),
      this.storefrontRepository.countActiveProductsByCategory(store.id, category.id),
    ]);

    return {
      ...toStorefrontCategoryView(category),
      products: products.map(toStorefrontProductView),
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  /** GET /api/v1/storefront/pages/:slug — PUBLISHED page with sections + SEO metadata. */
  async getPageBySlug(
    request: Pick<Request, 'headers'>,
    slug: string,
  ): Promise<StorefrontPageView> {
    const store = await this.storeResolver.resolve(request);
    const page = await this.storefrontRepository.findPublishedPageBySlug(store.id, slug);
    if (!page) {
      throw new NotFoundError('The page was not found.');
    }
    return toStorefrontPageView(page);
  }
}
