import { Injectable } from '@nestjs/common';
import { VariantStatus } from '@prisma/client';
import { RequestContextService } from '../../common/context/request-context.service';
import {
  ConflictError,
  NotFoundError,
  StateTransitionError,
} from '../../common/errors/domain-exceptions';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { toVariantView, VariantView } from '../catalog.types';
import { mapCatalogWriteError } from '../domain/catalog-error.mapper';
import { variantArchiveTarget } from '../domain/catalog-status';
import { requireStoreId } from '../domain/catalog-tenant';
import { CreateVariantDto } from '../dto/create-variant.dto';
import { UpdateVariantDto } from '../dto/update-variant.dto';
import { ProductRepository } from '../repositories/product.repository';
import { ProductVariantRepository } from '../repositories/product-variant.repository';

/** P2002 conflict messages keyed by the unique-index target (see mapper). */
const VARIANT_UNIQUE_MESSAGES = {
  'store_id,sku': 'A variant with this SKU already exists in this store.',
};

/**
 * Catalog ProductVariant application service.
 *
 * Business rules implemented here (docs/DOMAIN-MODEL.md §7.2, docs/DATABASE.md
 * §7.6/§25.1, docs/API-SPEC.md §17):
 *
 * - A variant ALWAYS belongs to the store of its Product; the parent Product
 *   must exist in the trusted tenant before a variant is created. The
 *   composite (store_id, product_id) FK is the final defense.
 * - Money is integer minor units (EGP piastres), never floating point.
 * - SKU (when present) is unique within the store; empty SKUs are normalized
 *   to NULL so multiple SKU-less variants remain valid.
 * - Lifecycle: ACTIVE -> ARCHIVED (archive endpoint); ARCHIVED is terminal.
 * - No inventory fields exist here — Inventory is the next phase and is NOT
 *   created by the Catalog module.
 */
@Injectable()
export class VariantsService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly products: ProductRepository,
    private readonly variants: ProductVariantRepository,
    private readonly transaction: TransactionService,
  ) {}

  async listByProduct(productId: string): Promise<VariantView[]> {
    const storeId = requireStoreId(this.requestContext);

    const product = await this.products.findById(storeId, productId);
    if (!product) {
      throw new NotFoundError('The product was not found.');
    }

    const variants = await this.variants.findByProductId(storeId, productId);
    return variants.map(toVariantView);
  }

  async create(productId: string, dto: CreateVariantDto): Promise<VariantView> {
    const storeId = requireStoreId(this.requestContext);

    const product = await this.products.findById(storeId, productId);
    if (!product) {
      throw new NotFoundError('The product was not found.');
    }

    const sku = dto.sku === undefined ? null : normalizeSku(dto.sku);
    try {
      const variant = await this.transaction.runWithTenant(storeId, (tx) => {
        // Phase 24 — SKU uniqueness is pre-checked WITHIN the store BEFORE the
        // insert. Under RLS enforcement PostgreSQL suppresses the DETAIL of a
        // unique-violation error when the conflicting row is invisible to the
        // querying role, so Prisma reports meta.target=null and the generic
        // mapper cannot name the constraint. The tenant-bound pre-check sees
        // only this store's rows and produces the precise conflict; the
        // database unique index remains the atomic backstop.
        if (sku !== null) {
          return this.variants
            .findByStoreAndSku(tx, storeId, sku)
            .then((existing) => {
              if (existing) {
                throw new ConflictError('A variant with this SKU already exists in this store.');
              }
              return this.variants.create(tx, {
                storeId,
                productId,
                name: dto.name,
                sku,
                price: BigInt(dto.price),
                ...(dto.compareAtPrice !== undefined
                  ? {
                      compareAtPrice:
                        dto.compareAtPrice === null ? null : BigInt(dto.compareAtPrice),
                    }
                  : {}),
                status: VariantStatus.ACTIVE,
              });
            });
        }
        return this.variants.create(tx, {
          storeId,
          productId,
          name: dto.name,
          sku: null,
          price: BigInt(dto.price),
          ...(dto.compareAtPrice !== undefined
            ? { compareAtPrice: dto.compareAtPrice === null ? null : BigInt(dto.compareAtPrice) }
            : {}),
          status: VariantStatus.ACTIVE,
        });
      });
      return toVariantView(variant);
    } catch (error) {
      throw mapCatalogWriteError(error, VARIANT_UNIQUE_MESSAGES);
    }
  }

  async update(variantId: string, dto: UpdateVariantDto): Promise<VariantView> {
    const storeId = requireStoreId(this.requestContext);

    try {
      const updated = await this.transaction.runWithTenant(storeId, async (tx) => {
        // Same RLS-aware SKU-uniqueness pre-check (Phase 24): when the SKU is
        // being changed, ensure no OTHER variant in this store already holds it.
        if (dto.sku !== undefined) {
          const sku = normalizeSku(dto.sku);
          if (sku !== null) {
            const existing = await this.variants.findByStoreAndSku(tx, storeId, sku);
            if (existing && existing.id !== variantId) {
              throw new ConflictError('A variant with this SKU already exists in this store.');
            }
          }
          return this.variants.update(tx, storeId, variantId, {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            sku,
            ...(dto.price !== undefined ? { price: BigInt(dto.price) } : {}),
            ...(dto.compareAtPrice !== undefined
              ? { compareAtPrice: dto.compareAtPrice === null ? null : BigInt(dto.compareAtPrice) }
              : {}),
          });
        }
        return this.variants.update(tx, storeId, variantId, {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.price !== undefined ? { price: BigInt(dto.price) } : {}),
          ...(dto.compareAtPrice !== undefined
            ? { compareAtPrice: dto.compareAtPrice === null ? null : BigInt(dto.compareAtPrice) }
            : {}),
        });
      });
      return toVariantView(updated);
    } catch (error) {
      throw mapCatalogWriteError(error, VARIANT_UNIQUE_MESSAGES);
    }
  }

  async archive(variantId: string): Promise<VariantView> {
    const storeId = requireStoreId(this.requestContext);

    const variant = await this.variants.findById(storeId, variantId);
    if (!variant) {
      throw new NotFoundError('The variant was not found.');
    }

    const target = variantArchiveTarget(variant.status);

    const result = await this.transaction.runWithTenant(storeId, (tx) =>
      this.variants.updateStatus(tx, storeId, variantId, variant.status, target),
    );

    if (result.count === 0) {
      throw new StateTransitionError(`The variant could not be transitioned to ${target} status.`);
    }

    const updated = await this.variants.findById(storeId, variantId);
    if (!updated) {
      throw new NotFoundError('The variant was not found.');
    }
    return toVariantView(updated);
  }
}

/**
 * Normalizes a SKU: trims surrounding whitespace and treats an empty value as
 * NULL so it does not collide under the store-scoped UNIQUE(store_id, sku)
 * (multiple NULLs are allowed by PostgreSQL).
 */
function normalizeSku(sku: string): string | null {
  const trimmed = sku.trim();
  return trimmed.length === 0 ? null : trimmed;
}
