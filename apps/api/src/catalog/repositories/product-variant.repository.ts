import { Injectable } from '@nestjs/common';
import { Prisma, ProductVariant, VariantStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Minimal write input for creating a ProductVariant (docs/DATABASE.md §7.6). */
export interface CreateVariantInput {
  storeId: string;
  productId: string;
  name: string;
  sku?: string | null;
  price: bigint;
  compareAtPrice?: bigint | null;
  status: VariantStatus;
}

/** Minimal write input for updating a ProductVariant. */
export interface UpdateVariantInput {
  name?: string;
  sku?: string | null;
  price?: bigint;
  compareAtPrice?: bigint | null;
}

/**
 * Persistence access for the `product_variants` table.
 *
 * Encapsulates Prisma access only — no business rules. Every read and write is
 * store-scoped (composite `storeId_id` unique target / storeId filters), so a
 * Catalog operation can never touch another tenant's variants (the composite
 * `(store_id, product_id)` FK is the final tenant-safety defense).
 */
@Injectable()
export class ProductVariantRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(tx: Prisma.TransactionClient, data: CreateVariantInput): Promise<ProductVariant> {
    return tx.productVariant.create({ data: { ...data } });
  }

  async update(
    tx: Prisma.TransactionClient,
    storeId: string,
    variantId: string,
    data: UpdateVariantInput,
  ): Promise<ProductVariant> {
    return tx.productVariant.update({
      where: { storeId_id: { storeId, id: variantId } },
      data: { ...data },
    });
  }

  /**
   * Concurrency-safe lifecycle transition (docs/DATABASE.md §26.2 — guarded
   * UPDATE WHERE status = current).
   */
  async updateStatus(
    tx: Prisma.TransactionClient,
    storeId: string,
    variantId: string,
    from: VariantStatus,
    to: VariantStatus,
  ): Promise<{ count: number }> {
    return tx.productVariant.updateMany({
      where: { id: variantId, storeId, status: from },
      data: { status: to },
    });
  }

  async findById(storeId: string, variantId: string): Promise<ProductVariant | null> {
    return this.prisma.productVariant.findUnique({
      where: { storeId_id: { storeId, id: variantId } },
    });
  }

  /**
   * Finds a variant by its store-scoped SKU (Phase 24 — RLS-aware uniqueness
   * pre-check). Runs on the tenant-bound transaction client so RLS scopes it
   * to the bound store; used before insert/update so the API can return the
   * precise conflict message even though PostgreSQL suppresses the unique
   * violation DETAIL for roles subject to RLS.
   */
  async findByStoreAndSku(
    tx: Prisma.TransactionClient,
    storeId: string,
    sku: string,
  ): Promise<ProductVariant | null> {
    return tx.productVariant.findFirst({ where: { storeId, sku } });
  }

  async findByProductId(storeId: string, productId: string): Promise<ProductVariant[]> {
    return this.prisma.productVariant.findMany({
      where: { storeId, productId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async countByProductId(storeId: string, productId: string): Promise<number> {
    return this.prisma.productVariant.count({ where: { storeId, productId } });
  }
}
