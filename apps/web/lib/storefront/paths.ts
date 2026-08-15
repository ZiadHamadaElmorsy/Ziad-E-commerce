/**
 * Storefront routing helpers (Phase 19).
 *
 * Local development serves the storefront under `/store/[slug]/...` and the
 * API resolves the store from the `X-Storefront-Slug` header. The same URL
 * strategy is ready for a future `https://merchant-slug.yourdomain.com` host
 * deployment (see docs/IMPLEMENTATION-PHASE19-MERCHANT-STOREFRONT.md) — no
 * wildcard production DNS is configured today.
 */

export function storeHomePath(slug: string): string {
  return `/store/${slug}`;
}

export function storeProductsPath(slug: string): string {
  return `/store/${slug}/products`;
}

export function storeProductPath(slug: string, productSlug: string): string {
  return `/store/${slug}/products/${productSlug}`;
}

export function storeCategoriesPath(slug: string): string {
  return `/store/${slug}/categories`;
}

export function storeCategoryPath(slug: string, categorySlug: string): string {
  return `/store/${slug}/categories/${categorySlug}`;
}

export function storePagePath(slug: string, pageSlug: string): string {
  return `/store/${slug}/pages/${pageSlug}`;
}

export function storeCartPath(slug: string): string {
  return `/store/${slug}/cart`;
}

export function storeCheckoutPath(slug: string): string {
  return `/store/${slug}/checkout`;
}

export function storeOrderPath(slug: string, orderId: string): string {
  return `/store/${slug}/orders/${orderId}`;
}

/**
 * Maps a CMS navigation item ({label, type, value}) to a storefront route.
 * PAGE -> store page, CATEGORY -> category page, DESTINATION -> known
 * destinations (home/products/categories/cart). Unrecognized destinations fall
 * back to the store home.
 */
export function navigationItemPath(
  slug: string,
  item: { label: string; type: string; value: string },
): string {
  const type = item.type.toUpperCase();
  const value = item.value;
  if (type === 'PAGE') return storePagePath(slug, value);
  if (type === 'CATEGORY') return storeCategoryPath(slug, value);
  if (type === 'DESTINATION') {
    const destination = value.toLowerCase();
    if (destination === 'products' || destination === 'all-products') {
      return storeProductsPath(slug);
    }
    if (destination === 'categories') {
      return storeCategoriesPath(slug);
    }
    if (destination === 'cart') {
      return storeCartPath(slug);
    }
  }
  return storeHomePath(slug);
}
