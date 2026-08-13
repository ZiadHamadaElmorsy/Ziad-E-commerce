import { Injectable } from '@nestjs/common';
import { CategoryStatus, Prisma } from '@prisma/client';
import { RequestContextService } from '../../common/context/request-context.service';
import { NotFoundError, StateTransitionError } from '../../common/errors/domain-exceptions';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { buildPaginationMeta, CategoryView, PaginatedView, toCategoryView } from '../catalog.types';
import { mapCatalogWriteError } from '../domain/catalog-error.mapper';
import { assertValidCatalogSlug, slugify } from '../domain/catalog-slug';
import { categoryArchiveTarget } from '../domain/catalog-status';
import { requireStoreId } from '../domain/catalog-tenant';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { ListCategoriesQueryDto } from '../dto/list-categories-query.dto';
import { UpdateCategoryDto } from '../dto/update-category.dto';
import { CategoryRepository } from '../repositories/category.repository';
import { ProductCategoryRepository } from '../repositories/product-category.repository';
import { ProductRepository } from '../repositories/product.repository';

/** P2002 conflict messages keyed by the unique-index target (see mapper). */
const CATEGORY_UNIQUE_MESSAGES = {
  'store_id,slug': 'A category with this slug already exists in this store.',
  'product_id,category_id': 'This product is already assigned to this category.',
};

/**
 * Catalog Category + ProductCategory application service.
 *
 * Business rules implemented here (docs/DOMAIN-MODEL.md §7.3/§7.4,
 * docs/DATABASE.md §7.7/§7.8/§25.1, docs/API-SPEC.md §18):
 *
 * - Categories are FLAT in the MVP (no parent/child hierarchy).
 * - Category ownership is ALWAYS the trusted tenant context; MVP categories
 *   are store-scoped with store-scoped slug uniqueness.
 * - Lifecycle: ACTIVE -> ARCHIVED (archive endpoint); ARCHIVED is terminal and
 *   existing Product associations are preserved (historical data unchanged).
 * - ProductCategory (N:M join): both sides must exist in the SAME store; the
 *   composite store-scoped FKs are the final defense against cross-tenant
 *   links; UNIQUE (product_id, category_id) prevents duplicate links
 *   (P2002 -> CONFLICT).
 * - Unassigning (deleting the link row) is the normal operation
 *   (docs/DATABASE.md §25.1: product_categories are physically deletable).
 */
@Injectable()
export class CategoriesService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly categories: CategoryRepository,
    private readonly products: ProductRepository,
    private readonly productCategories: ProductCategoryRepository,
    private readonly transaction: TransactionService,
  ) {}

  async create(dto: CreateCategoryDto): Promise<CategoryView> {
    const storeId = requireStoreId(this.requestContext);

    const baseSlug = slugify(dto.name);
    assertValidCatalogSlug(baseSlug);

    try {
      const category = await this.transaction.runWithTenant(storeId, async (tx) => {
        const slug = await this.resolveUniqueSlug(tx, storeId, baseSlug);
        return this.categories.create(tx, {
          storeId,
          name: dto.name,
          slug,
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          status: CategoryStatus.ACTIVE,
        });
      });
      return toCategoryView(category);
    } catch (error) {
      throw mapCatalogWriteError(error, CATEGORY_UNIQUE_MESSAGES);
    }
  }

  async list(query: ListCategoriesQueryDto): Promise<PaginatedView<CategoryView>> {
    const storeId = requireStoreId(this.requestContext);
    const skip = (query.page - 1) * query.limit;

    const filter = {
      skip,
      take: query.limit,
      orderBy: { createdAt: 'desc' as const },
    };

    const [items, total] = await Promise.all([
      this.categories.findMany(storeId, filter),
      this.categories.count(storeId),
    ]);

    return {
      items: items.map(toCategoryView),
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  async get(categoryId: string): Promise<CategoryView> {
    const storeId = requireStoreId(this.requestContext);
    const category = await this.categories.findById(storeId, categoryId);
    if (!category) {
      throw new NotFoundError('The category was not found.');
    }
    return toCategoryView(category);
  }

  /**
   * Returns the categories assigned to one Product (docs/API-SPEC.md §18
   * product-category links). The product must exist in the current Store; the
   * link rows themselves are store-scoped so cross-tenant categories are
   * impossible.
   */
  async listForProduct(productId: string): Promise<CategoryView[]> {
    const storeId = requireStoreId(this.requestContext);

    const product = await this.products.findById(storeId, productId);
    if (!product) {
      throw new NotFoundError('The product was not found.');
    }

    const categories = await this.productCategories.findCategoriesByProduct(storeId, productId);
    return categories.map((category) => toCategoryView(category));
  }

  async update(categoryId: string, dto: UpdateCategoryDto): Promise<CategoryView> {
    const storeId = requireStoreId(this.requestContext);
    try {
      const updated = await this.transaction.runWithTenant(storeId, (tx) =>
        this.categories.update(tx, storeId, categoryId, {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
        }),
      );
      return toCategoryView(updated);
    } catch (error) {
      throw mapCatalogWriteError(error, CATEGORY_UNIQUE_MESSAGES);
    }
  }

  async archive(categoryId: string): Promise<CategoryView> {
    const storeId = requireStoreId(this.requestContext);

    const category = await this.categories.findById(storeId, categoryId);
    if (!category) {
      throw new NotFoundError('The category was not found.');
    }

    const target = categoryArchiveTarget(category.status);

    const result = await this.transaction.runWithTenant(storeId, (tx) =>
      this.categories.updateStatus(tx, storeId, categoryId, category.status, target),
    );

    if (result.count === 0) {
      throw new StateTransitionError(`The category could not be transitioned to ${target} status.`);
    }

    const updated = await this.categories.findById(storeId, categoryId);
    if (!updated) {
      throw new NotFoundError('The category was not found.');
    }
    return toCategoryView(updated);
  }

  /**
   * Assigns a Product to a Category (docs/API-SPEC.md §18 "Assign Product to
   * Category"). Both entities must exist in the current Store; the composite
   * store-scoped FKs and UNIQUE (product_id, category_id) remain the final
   * database defenses.
   */
  async assignProduct(
    productId: string,
    categoryId: string,
  ): Promise<{ productId: string; categoryId: string }> {
    const storeId = requireStoreId(this.requestContext);

    const product = await this.products.findById(storeId, productId);
    if (!product) {
      throw new NotFoundError('The product was not found.');
    }
    const category = await this.categories.findById(storeId, categoryId);
    if (!category) {
      throw new NotFoundError('The category was not found.');
    }

    try {
      await this.transaction.runWithTenant(storeId, (tx) =>
        this.productCategories.create(tx, { storeId, productId, categoryId }),
      );
      return { productId, categoryId };
    } catch (error) {
      throw mapCatalogWriteError(error, CATEGORY_UNIQUE_MESSAGES);
    }
  }

  /**
   * Removes a Product from a Category (docs/API-SPEC.md §18 "Remove Product
   * from Category"). This is the normal link-removal operation; the link row
   * is physically deleted (docs/DATABASE.md §25.1).
   */
  async removeProductFromCategory(productId: string, categoryId: string): Promise<void> {
    const storeId = requireStoreId(this.requestContext);

    const result = await this.transaction.runWithTenant(storeId, (tx) =>
      this.productCategories.deleteLink(tx, storeId, productId, categoryId),
    );

    if (result.count === 0) {
      throw new NotFoundError('The product-category link was not found.');
    }
  }

  private async resolveUniqueSlug(
    tx: Prisma.TransactionClient,
    storeId: string,
    baseSlug: string,
  ): Promise<string> {
    let candidate = baseSlug;
    let suffix = 2;
    while (await this.categories.existsBySlug(tx, storeId, candidate)) {
      candidate = `${baseSlug}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }
}
