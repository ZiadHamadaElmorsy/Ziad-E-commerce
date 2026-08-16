import {
  Category,
  CategoryStatus,
  Product,
  ProductStatus,
  ProductVariant,
  VariantStatus,
} from '@prisma/client';

/**
 * Public Catalog representations returned by the merchant Catalog API.
 *
 * Intentionally exclude internal columns (store_id, created_at, updated_at,
 * cost_price) and database implementation details — only fields documented in
 * the source documents (docs/DATABASE.md §7.5-7.8) are exposed. Money is
 * rendered as integer minor units (EGP piastres); the internal BIGINT is
 * converted to a plain number by the mappers.
 */

export interface VariantView {
  id: string;
  productId: string;
  name: string;
  sku: string | null;
  price: number;
  compareAtPrice: number | null;
  status: VariantStatus;
}

/** A product image reference (media id + alt text; no storage internals). */
export interface ProductImage {
  id: string;
  altText: string | null;
}

export interface ProductView {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: ProductStatus;
  variants: VariantView[];
  /** Product images ordered by sort_order (media ids resolvable via /media/:id). */
  images: ProductImage[];
}

export interface CategoryView {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: CategoryStatus;
}

/** Pagination metadata per docs/API-SPEC.md §7 (collection responses). */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedView<T> {
  items: T[];
  meta: PaginationMeta;
}

/** Converts a stored BIGINT minor-units price to a plain JSON-safe number. */
export function priceToNumber(price: bigint): number {
  return Number(price);
}

export function toVariantView(variant: ProductVariant): VariantView {
  return {
    id: variant.id,
    productId: variant.productId,
    name: variant.name,
    sku: variant.sku,
    price: priceToNumber(variant.price),
    compareAtPrice: variant.compareAtPrice === null ? null : priceToNumber(variant.compareAtPrice),
    status: variant.status,
  };
}

/** Maps the product_media relation rows to the public image reference list. */
export function toProductImages(
  productMedia: Array<{ media: { id: string; altText: string | null } }> | undefined,
): ProductImage[] {
  return (productMedia ?? []).map((pm) => ({ id: pm.media.id, altText: pm.media.altText }));
}

export function toProductView(
  product: Product,
  variants: ProductVariant[],
  productMedia?: Array<{ media: { id: string; altText: string | null } }>,
): ProductView {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    status: product.status,
    variants: variants.map(toVariantView),
    images: toProductImages(productMedia),
  };
}

export function toCategoryView(category: Category): CategoryView {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    status: category.status,
  };
}

/** Builds the collection pagination metadata (docs/API-SPEC.md §7). */
export function buildPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}
