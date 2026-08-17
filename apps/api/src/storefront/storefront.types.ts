import { VariantStatus } from '@prisma/client';
import {
  buildPaginationMeta,
  PaginationMeta,
  PaginatedView,
  priceToNumber,
} from '../catalog/catalog.types';
import { computeAvailable } from '../inventory/inventory.types';

/**
 * Public Storefront representations (docs/API-SPEC.md §31-§32, §36).
 *
 * These views are the PUBLIC read contract of the customer-facing storefront.
 * Only fields documented in the source documents are exposed; internal columns
 * (store_id, status, sku, compare_at_price, cost_price, created_at, updated_at,
 * storage paths, inventory quantities) MUST never leak (API-SPEC §32: "Internal
 * fields must never leak to the public Storefront API").
 *
 * Money is rendered as integer minor units (EGP piastres) via priceToNumber.
 */

/** Public store configuration required to render the storefront (API-SPEC §36). */
export interface StorefrontStoreView {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  currency: string;
  timezone: string;
  /**
   * Public payment availability (Phase 22): which payment methods the customer
   * can actually use at checkout. `payOnline` reflects the deployment-level
   * Paymob configuration; `whatsapp` reflects the merchant's store-scoped
   * WhatsApp settings (null when disabled/invalid).
   */
  payments: {
    payOnline: boolean;
    whatsapp: {
      enabled: boolean;
      phoneNumber: string;
      label: string | null;
    } | null;
  };
}

/** A public product image reference (media id + alt text; no storage internals). */
export interface StorefrontImage {
  id: string;
  altText: string | null;
  /** Variant the image is linked to, or null for product-level images. */
  variantId?: string | null;
  isPrimary?: boolean;
  sortOrder?: number;
}

/** A gallery association exposed to the storefront (media id + variant link). */
export interface StorefrontProductMediaView {
  mediaId: string;
  variantId: string | null;
  altText: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

/** A purchasable public variant with its current availability. */
export interface StorefrontVariantView {
  id: string;
  name: string;
  /** Structured attributes (e.g. { color: 'Black', size: 'M' }) or null. */
  attributes: Record<string, string> | null;
  price: number;
  available: boolean;
}

/** A public storefront category (ACTIVE only). */
export interface StorefrontCategoryView {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

/** The documented Storefront Product Response (docs/API-SPEC.md §32). */
export interface StorefrontProductView {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  /** The product's categories (ACTIVE) — category browsing/breadcrumbs. */
  categories: StorefrontCategoryView[];
  /**
   * FIRST page of the ordered gallery (bounded). The complete gallery is
   * browsed through GET /storefront/products/:slug/media (paginated) so a
   * 1000-image product never ships 1000 media rows in the detail payload.
   */
  images: StorefrontImage[];
  /** Total number of attached media records (for gallery pagination). */
  totalImages: number;
  variants: StorefrontVariantView[];
}

/** Category detail with its ACTIVE products (MVP-SCOPE §21 Category page). */
export interface StorefrontCategoryDetailView extends StorefrontCategoryView {
  products: StorefrontProductView[];
  meta: PaginationMeta;
}

/** A public storefront page section (ordered by sort_order). */
export interface StorefrontSectionView {
  id: string;
  sectionType: string;
  content: unknown;
  sortOrder: number;
}

/** A public storefront page (PUBLISHED only) with its sections and SEO metadata. */
export interface StorefrontPageView {
  id: string;
  title: string;
  slug: string;
  seoTitle: string | null;
  seoDescription: string | null;
  sections: StorefrontSectionView[];
}

/** Internal row shape the storefront repository returns for a product list item. */
export interface StorefrontProductRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  productCategories?: Array<{ category: { id: string; name: string; slug: string; description: string | null } }>;
  variants: Array<{
    id: string;
    name: string;
    attributes: unknown;
    price: bigint;
    status: VariantStatus;
    inventory: { onHandQuantity: number; reservedQuantity: number } | null;
  }>;
  productMedia: Array<{
    media: { id: string; altText: string | null };
    /** Populated by the DETAIL include; absent on product list rows. */
    variantId?: string | null;
    isPrimary?: boolean;
    sortOrder?: number;
  }>;
  /** Total attached media count — populated only by the product detail read. */
  totalImages?: number;
  /** Prisma relation count on the detail include (product_media count). */
  _count?: { productMedia: number };
}

export function toStorefrontStoreView(
  store: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    currency: string;
    timezone: string;
  },
  payments: StorefrontStoreView['payments'],
): StorefrontStoreView {
  return {
    id: store.id,
    name: store.name,
    slug: store.slug,
    description: store.description,
    currency: store.currency,
    timezone: store.timezone,
    payments,
  };
}

/** Normalizes variant attributes to a string map (or null). */
export function storefrontVariantAttributes(attributes: unknown): Record<string, string> | null {
  if (attributes === null || attributes === undefined) return null;
  if (typeof attributes !== 'object' || Array.isArray(attributes)) return null;
  const entries = Object.entries(attributes as Record<string, unknown>);
  const normalized: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (typeof value === 'string' && value.trim().length > 0) {
      normalized[key] = value;
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}

export function toStorefrontProductView(product: StorefrontProductRow): StorefrontProductView {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    categories: (product.productCategories ?? []).map((link) => ({
      id: link.category.id,
      name: link.category.name,
      slug: link.category.slug,
      description: link.category.description,
    })),
    images: (product.productMedia ?? []).map((pm) => {
      const image: StorefrontImage = { id: pm.media.id, altText: pm.media.altText };
      // Detail rows carry the association fields; product list rows do not.
      if (pm.variantId !== undefined) image.variantId = pm.variantId;
      if (pm.isPrimary !== undefined) image.isPrimary = pm.isPrimary;
      if (pm.sortOrder !== undefined) image.sortOrder = pm.sortOrder;
      return image;
    }),
    totalImages: product.totalImages ?? product._count?.productMedia ?? (product.productMedia ?? []).length,
    variants: (product.variants ?? [])
      .filter((variant) => variant.status === VariantStatus.ACTIVE)
      .map((variant) => ({
        id: variant.id,
        name: variant.name,
        attributes: storefrontVariantAttributes(variant.attributes),
        price: priceToNumber(variant.price),
        available: variant.inventory
          ? computeAvailable(variant.inventory.onHandQuantity, variant.inventory.reservedQuantity) >
            0
          : false,
      })),
  };
}

export function toStorefrontCategoryView(category: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}): StorefrontCategoryView {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
  };
}

export function toStorefrontPageView(page: {
  id: string;
  title: string;
  slug: string;
  seoTitle: string | null;
  seoDescription: string | null;
  sections: Array<{ id: string; sectionType: string; content: unknown; sortOrder: number }>;
}): StorefrontPageView {
  return {
    id: page.id,
    title: page.title,
    slug: page.slug,
    seoTitle: page.seoTitle,
    seoDescription: page.seoDescription,
    sections: (page.sections ?? []).map((section) => ({
      id: section.id,
      sectionType: section.sectionType,
      content: section.content,
      sortOrder: section.sortOrder,
    })),
  };
}

export { buildPaginationMeta, PaginatedView };
