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
  /** Structured variant attributes (e.g. { color: 'Black', size: 'M' }). */
  attributes: Record<string, string> | null;
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

/** A ProductMedia gallery row: the association + minimal media metadata. */
export interface ProductMediaView {
  id: string;
  mediaId: string;
  variantId: string | null;
  altText: string | null;
  sortOrder: number;
  isPrimary: boolean;
  mediaType: 'IMAGE' | 'VIDEO' | 'FILE';
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: Date | string;
}

export interface ProductView {
  id: string;
  name: string;
  nameAr: string | null;
  nameEn: string | null;
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
  nameAr: string | null;
  nameEn: string | null;
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
    attributes: normalizeAttributes(variant.attributes),
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

/** Normalizes a stored JSONB attributes value to a string map (or null). */
export function normalizeAttributes(attributes: unknown): Record<string, string> | null {
  if (attributes === null || attributes === undefined) return null;
  if (typeof attributes !== 'object' || Array.isArray(attributes)) return null;
  const entries = Object.entries(attributes as Record<string, unknown>);
  if (entries.length === 0) return null;
  const normalized: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (typeof value === 'string' && value.trim().length > 0) {
      normalized[key] = value;
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}

/** Maps a ProductMedia row + media metadata to the public gallery view. */
export function toProductMediaView(
  link: {
    id: string;
    mediaId: string;
    variantId: string | null;
    altText: string | null;
    sortOrder: number;
    isPrimary: boolean;
    createdAt: Date | string;
    media: { mediaType: string; mimeType: string | null; sizeBytes: bigint | null };
  },
): ProductMediaView {
  return {
    id: link.id,
    mediaId: link.mediaId,
    variantId: link.variantId,
    altText: link.altText,
    sortOrder: link.sortOrder,
    isPrimary: link.isPrimary,
    mediaType: link.media.mediaType as ProductMediaView['mediaType'],
    mimeType: link.media.mimeType,
    sizeBytes: link.media.sizeBytes === null ? null : priceToNumber(link.media.sizeBytes),
    createdAt: link.createdAt,
  };
}

export function toProductView(
  product: Product,
  variants: ProductVariant[],
  productMedia?: Array<{ media: { id: string; altText: string | null } }>,
): ProductView {
  return {
    id: product.id,
    name: product.name,
    nameAr: product.nameAr ?? null,
    nameEn: product.nameEn ?? null,
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
    nameAr: category.nameAr ?? null,
    nameEn: category.nameEn ?? null,
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
