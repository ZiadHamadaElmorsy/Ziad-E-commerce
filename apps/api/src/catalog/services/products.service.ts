import { Injectable } from '@nestjs/common';
import { Prisma, Product, ProductStatus, VariantStatus } from '@prisma/client';
import { RequestContextService } from '../../common/context/request-context.service';
import {
  NotFoundError,
  StateTransitionError,
  ValidationError,
} from '../../common/errors/domain-exceptions';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { MediaRepository } from '../../media/repositories/media.repository';
import {
  buildPaginationMeta,
  PaginatedView,
  ProductMediaView,
  ProductView,
  toProductMediaView,
  toProductView,
} from '../catalog.types';
import { mapCatalogWriteError } from '../domain/catalog-error.mapper';
import { assertValidCatalogSlug, slugify } from '../domain/catalog-slug';
import {
  productArchiveTarget,
  productPublishTarget,
  productUnpublishTarget,
} from '../domain/catalog-status';
import { requireStoreId } from '../domain/catalog-tenant';
import { CreateProductDto } from '../dto/create-product.dto';
import { ListProductsQueryDto } from '../dto/list-products-query.dto';
import {
  AttachProductMediaDto,
  ListProductMediaQueryDto,
  ReorderProductMediaDto,
  UpdateProductMediaDto,
} from '../dto/product-media.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { ProductMediaRepository } from '../repositories/product-media.repository';
import { ProductRepository } from '../repositories/product.repository';
import { ProductVariantRepository } from '../repositories/product-variant.repository';

/** P2002 conflict messages keyed by the unique-index target (see mapper). */
const PRODUCT_UNIQUE_MESSAGES = {
  'store_id,slug': 'A product with this slug already exists in this store.',
  'product_id,media_id': 'This image is already attached to the product.',
};


/**
 * Catalog Product application service.
 *
 * Business rules implemented here (docs/DOMAIN-MODEL.md §7.1, docs/DATABASE.md
 * §7.5/§25.1, docs/API-SPEC.md §16):
 *
 * - Product ownership is ALWAYS the trusted tenant context (membership ->
 *   store); client-supplied ids are never an authorization source.
 * - Every Product MUST have at least one ProductVariant. Creating a Product
 *   atomically creates its Default ProductVariant inside the same transaction
 *   (rollback on any failure — no orphan products).
 * - Lifecycle: DRAFT -> ACTIVE -> ARCHIVED through the dedicated publish /
 *   unpublish / archive endpoints; ARCHIVED is terminal. Transitions use
 *   guarded conditional UPDATEs (docs/DATABASE.md §26.2).
 * - Store-scoped slug uniqueness with automatic `-2`, `-3`, ... collision
 *   resolution.
 * - Product images are the ordered `product_media` associations: attaching is
 *   store-scoped (product AND media must belong to the same store), appends at
 *   the end of the gallery and is idempotent-safe (a duplicate association is
 *   a CONFLICT, not a corruption). Removing an association never touches the
 *   media binary/metadata row.
 * - Physical deletion is NOT exposed (docs/API-SPEC.md defines no DELETE
 *   endpoint); the retention rules of docs/DATABASE.md §25.1 are honored by
 *   archiving.
 */
@Injectable()
export class ProductsService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly products: ProductRepository,
    private readonly variants: ProductVariantRepository,
    private readonly transaction: TransactionService,
    private readonly productMedia: ProductMediaRepository,
    private readonly media: MediaRepository,
  ) {}

  /**
   * Atomically creates the Product AND its Default ProductVariant
   * (docs/DOMAIN-MODEL.md §7.1 invariant). Either both exist or neither.
   */
  async create(dto: CreateProductDto): Promise<ProductView> {
    const storeId = requireStoreId(this.requestContext);

    const baseSlug = slugify(dto.name);
    assertValidCatalogSlug(baseSlug);

    const status = dto.status ?? ProductStatus.DRAFT;
    if (status !== ProductStatus.DRAFT) {
      throw new ValidationError(
        'A product can only be created in DRAFT status. Use the publish endpoint to activate it.',
      );
    }

    try {
      const { product, variant } = await this.transaction.runWithTenant(storeId, async (tx) => {
        const slug = await this.resolveUniqueSlug(tx, storeId, baseSlug);
        const created = await this.products.create(tx, {
          storeId,
          name: dto.name,
          ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
          ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
          slug,
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          status,
        });
        const defaultVariant = await this.variants.create(tx, {
          storeId,
          productId: created.id,
          name: dto.name,
          price: 0n,
          status: VariantStatus.ACTIVE,
        });
        return { product: created, variant: defaultVariant };
      });

      return toProductView(product, [variant], []);
    } catch (error) {
      throw mapCatalogWriteError(error, PRODUCT_UNIQUE_MESSAGES);
    }
  }

  async list(query: ListProductsQueryDto): Promise<PaginatedView<ProductView>> {
    const storeId = requireStoreId(this.requestContext);
    const skip = (query.page - 1) * query.limit;

    const filter = {
      search: query.search,
      status: query.status,
      categoryId: query.categoryId,
      skip,
      take: query.limit,
      orderBy: this.buildOrderBy(query.sort, query.order),
    };

    const [items, total] = await Promise.all([
      this.products.findMany(storeId, filter),
      this.products.count(storeId, filter),
    ]);

    return {
      items: items.map((product) => toProductView(product, product.variants, product.productMedia)),
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  async get(productId: string): Promise<ProductView> {
    const storeId = requireStoreId(this.requestContext);
    const product = await this.products.findById(storeId, productId, true);
    if (!product) {
      throw new NotFoundError('The product was not found.');
    }
    return toProductView(product, product.variants, product.productMedia);
  }

  async update(productId: string, dto: UpdateProductDto): Promise<ProductView> {
    const storeId = requireStoreId(this.requestContext);
    try {
      await this.transaction.runWithTenant(storeId, async (tx) => {
        await this.products.update(tx, storeId, productId, {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
          ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
        });
      });
    } catch (error) {
      throw mapCatalogWriteError(error, PRODUCT_UNIQUE_MESSAGES);
    }

    const updated = await this.products.findById(storeId, productId, true);
    if (!updated) {
      throw new NotFoundError('The product was not found.');
    }
    return toProductView(updated, updated.variants, updated.productMedia);
  }

  /**
   * POST /products/:productId/media/:mediaId — attaches an existing media asset
   * as a product image.
   *
   * Store-scoped on BOTH sides: the product and the media must belong to the
   * store resolved from the tenant context (never client input). The image is
   * appended at the end of the product's ordered gallery. A duplicate
   * association is rejected with CONFLICT (UNIQUE product_id, media_id).
   *
   * Phase 26 extensions (all optional):
   * - `variantId`: link the image to a variant of the SAME product+store.
   * - `isPrimary`: promote the image to the product cover (the previous
   *   primary, if any, is demoted in the same transaction).
   * - `altText`: per-association alt text.
   */
  async attachMedia(
    productId: string,
    mediaId: string,
    dto?: AttachProductMediaDto,
  ): Promise<ProductView> {
    const storeId = requireStoreId(this.requestContext);

    const product = await this.products.findById(storeId, productId);
    if (!product) {
      throw new NotFoundError('The product was not found.');
    }

    const mediaRow = await this.media.findByIdInStore(storeId, mediaId);
    if (!mediaRow) {
      throw new NotFoundError('The media asset was not found.');
    }

    if (dto?.variantId) {
      const variant = await this.variants.findById(storeId, dto.variantId);
      if (!variant || variant.productId !== productId) {
        throw new NotFoundError('The variant was not found for this product.');
      }
    }

    try {
      await this.transaction.runWithTenant(storeId, async (tx) => {
        const nextOrder = (await this.productMedia.maxSortOrder(tx, storeId, productId)) + 1;
        if (dto?.isPrimary) {
          await this.productMedia.clearPrimary(tx, storeId, productId);
        }
        await this.productMedia.create(tx, {
          storeId,
          productId,
          mediaId,
          sortOrder: nextOrder,
          ...(dto?.variantId !== undefined ? { variantId: dto.variantId } : {}),
          ...(dto?.altText !== undefined ? { altText: dto.altText } : {}),
          ...(dto?.isPrimary !== undefined ? { isPrimary: dto.isPrimary } : {}),
        });
      });
    } catch (error) {
      throw mapCatalogWriteError(error, PRODUCT_UNIQUE_MESSAGES);
    }

    return this.toDetailView(storeId, productId);
  }

  /**
   * DELETE /products/:productId/media/:mediaId — removes a product image
   * association. Store-scoped on both sides; absent/cross-tenant associations
   * fail closed with NOT_FOUND. The media metadata row and its storage object
   * are NOT touched here (media deletion remains a separate Media API concern).
   */
  async removeMedia(productId: string, mediaId: string): Promise<void> {
    const storeId = requireStoreId(this.requestContext);

    const product = await this.products.findById(storeId, productId);
    if (!product) {
      throw new NotFoundError('The product was not found.');
    }

    const result = await this.transaction.runWithTenant(storeId, (tx) =>
      this.productMedia.deleteLink(tx, storeId, productId, mediaId),
    );
    if (result.count === 0) {
      throw new NotFoundError('The product image association was not found.');
    }
  }

  /**
   * GET /products/:productId/media — paginated gallery metadata (Phase 26).
   * Returns association rows + minimal media metadata, ordered by sort_order.
   * The gallery can be filtered to a single variant (`?variantId=`).
   */
  async listGallery(
    productId: string,
    query: ListProductMediaQueryDto,
  ): Promise<PaginatedView<ProductMediaView>> {
    const storeId = requireStoreId(this.requestContext);

    const product = await this.products.findById(storeId, productId);
    if (!product) {
      throw new NotFoundError('The product was not found.');
    }

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.productMedia.findGalleryByProduct(storeId, productId, {
        variantId: query.variantId,
        skip,
        take: query.limit,
      }),
      this.productMedia.countByProduct(storeId, productId, query.variantId),
    ]);

    return {
      items: items.map(toProductMediaView),
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  /**
   * PATCH /products/:productId/media/:mediaId — updates ONE gallery
   * association: sort order (position), primary flag, variant link or alt
   * text. Every write is store-scoped; absent/cross-tenant links fail closed
   * with NOT_FOUND.
   */
  async updateMediaLink(
    productId: string,
    mediaId: string,
    dto: UpdateProductMediaDto,
  ): Promise<ProductView> {
    const storeId = requireStoreId(this.requestContext);

    const product = await this.products.findById(storeId, productId);
    if (!product) {
      throw new NotFoundError('The product was not found.');
    }

    if (dto.variantId !== undefined && dto.variantId !== null) {
      const variant = await this.variants.findById(storeId, dto.variantId);
      if (!variant || variant.productId !== productId) {
        throw new NotFoundError('The variant was not found for this product.');
      }
    }

    try {
      await this.transaction.runWithTenant(storeId, async (tx) => {
        if (dto.isPrimary) {
          await this.productMedia.clearPrimary(tx, storeId, productId);
        }
        const result = await this.productMedia.updateLink(tx, storeId, productId, mediaId, {
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(dto.isPrimary !== undefined ? { isPrimary: dto.isPrimary } : {}),
          ...(dto.variantId !== undefined ? { variantId: dto.variantId } : {}),
          ...(dto.altText !== undefined ? { altText: dto.altText } : {}),
        });
        if (!result) {
          throw new NotFoundError('The product image association was not found.');
        }
      });
    } catch (error) {
      throw mapCatalogWriteError(error, PRODUCT_UNIQUE_MESSAGES);
    }

    return this.toDetailView(storeId, productId);
  }

  /**
   * PUT /products/:productId/media/order — batch reorder (Phase 26). The
   * client sends a permutation of the product's attached media ids; positions
   * are assigned 0..n-1 in ONE tenant-bound transaction. Media ids not
   * attached to the product are ignored (defensive — they never leak across
   * tenants because the guarded UPDATEs are store+product-scoped).
   */
  async reorderMedia(productId: string, dto: ReorderProductMediaDto): Promise<ProductView> {
    const storeId = requireStoreId(this.requestContext);

    const product = await this.products.findById(storeId, productId);
    if (!product) {
      throw new NotFoundError('The product was not found.');
    }

    await this.transaction.runWithTenant(storeId, (tx) =>
      this.productMedia.reorderLinks(tx, storeId, productId, dto.order),
    );

    return this.toDetailView(storeId, productId);
  }

  /** Reloads the merchant product detail view (bounded gallery page). */
  private async toDetailView(storeId: string, productId: string): Promise<ProductView> {
    const updated = await this.products.findById(storeId, productId, true);
    if (!updated) {
      throw new NotFoundError('The product was not found.');
    }
    return toProductView(updated, updated.variants, updated.productMedia);
  }

  async publish(productId: string): Promise<ProductView> {
    return this.applyTransition(productId, productPublishTarget, async (product) => {
      const variantCount = await this.variants.countByProductId(product.storeId, product.id);
      if (variantCount === 0) {
        // Domain invariant (docs/DOMAIN-MODEL.md §7.1): a product with zero
        // variants is INVALID and can never become purchasable.
        throw new StateTransitionError(
          'A product cannot be published without at least one product variant.',
        );
      }
    });
  }

  async unpublish(productId: string): Promise<ProductView> {
    return this.applyTransition(productId, productUnpublishTarget);
  }

  async archive(productId: string): Promise<ProductView> {
    return this.applyTransition(productId, productArchiveTarget);
  }

  /**
   * Shared lifecycle transition. Pre-checks the source state with the pure
   * domain rules (STATE_TRANSITION on illegal transitions), then applies a
   * guarded conditional UPDATE inside a tenant-bound transaction so concurrent
   * requests cannot double-transition (docs/DATABASE.md §26.2).
   */
  private async applyTransition(
    productId: string,
    resolveTarget: (current: ProductStatus) => ProductStatus,
    precondition?: (product: Product) => Promise<void>,
  ): Promise<ProductView> {
    const storeId = requireStoreId(this.requestContext);

    const product = await this.products.findById(storeId, productId);
    if (!product) {
      throw new NotFoundError('The product was not found.');
    }

    if (precondition) {
      await precondition(product);
    }

    const target = resolveTarget(product.status);

    const result = await this.transaction.runWithTenant(storeId, (tx) =>
      this.products.updateStatus(tx, storeId, productId, product.status, target),
    );

    if (result.count === 0) {
      // The guarded UPDATE found no row in the expected source state — either
      // it vanished (impossible via the API; never physically deleted) or a
      // concurrent request transitioned it first.
      throw new StateTransitionError(`The product could not be transitioned to ${target} status.`);
    }

    const updated = await this.products.findById(storeId, productId, true);
    if (!updated) {
      throw new NotFoundError('The product was not found.');
    }
    return toProductView(updated, updated.variants, updated.productMedia);
  }

  private async resolveUniqueSlug(
    tx: Prisma.TransactionClient,
    storeId: string,
    baseSlug: string,
  ): Promise<string> {
    let candidate = baseSlug;
    let suffix = 2;
    while (await this.products.existsBySlug(tx, storeId, candidate)) {
      candidate = `${baseSlug}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  private buildOrderBy(
    sort: 'createdAt' | 'name',
    order: 'asc' | 'desc',
  ): Prisma.ProductOrderByWithRelationInput {
    return sort === 'name' ? { name: order } : { createdAt: order };
  }
}
