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
}

/** A purchasable public variant with its current availability. */
export interface StorefrontVariantView {
  id: string;
  name: string;
  price: number;
  available: boolean;
}

/** The documented Storefront Product Response (docs/API-SPEC.md §32). */
export interface StorefrontProductView {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  images: StorefrontImage[];
  variants: StorefrontVariantView[];
}

/** A public storefront category (ACTIVE only). */
export interface StorefrontCategoryView {
  id: string;
  name: string;
  slug: string;
  description: string | null;
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
  variants: Array<{
    id: string;
    name: string;
    price: bigint;
    status: VariantStatus;
    inventory: { onHandQuantity: number; reservedQuantity: number } | null;
  }>;
  productMedia: Array<{ media: { id: string; altText: string | null } }>;
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

export function toStorefrontProductView(product: StorefrontProductRow): StorefrontProductView {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    images: (product.productMedia ?? []).map((pm) => ({
      id: pm.media.id,
      altText: pm.media.altText,
    })),
    variants: (product.variants ?? [])
      .filter((variant) => variant.status === VariantStatus.ACTIVE)
      .map((variant) => ({
        id: variant.id,
        name: variant.name,
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
