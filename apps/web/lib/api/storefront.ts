import { appConfig } from '@/lib/config';
import { ApiError } from './client';
import type {
  Envelope,
  Paginated,
  StorefrontCategory,
  StorefrontCategoryDetail,
  StorefrontNavigation,
  StorefrontPage,
  StorefrontProduct,
  StorefrontProductMedia,
  StorefrontStore,
  StorefrontTheme,
} from '@/lib/storefront/types';

/**
 * Public Storefront read API (Phase 19) — docs/API-SPEC.md §31-§32.
 *
 * These calls are deliberately ANONYMOUS (no merchant session). The backend
 * resolves the store SERVER-SIDE via the existing StorefrontStoreResolver from
 * the `X-Storefront-Slug` header (with a Host-subdomain fallback) — a
 * client-supplied store id is never accepted anywhere.
 *
 * No secrets, tokens or merchant credentials are ever attached to these
 * requests.
 */

interface StorefrontRequestOptions {
  method?: 'GET';
  query?: Record<string, unknown>;
}

function storefrontFetch<T>(slug: string, path: string, options: StorefrontRequestOptions = {}): Promise<T> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();

  return fetch(`${appConfig.apiUrl}${path}${qs ? `?${qs}` : ''}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Storefront-Slug': slug,
    },
  }).then(async (response) => {
    if (!response.ok) {
      throw await parseStorefrontError(response);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  });
}

async function parseStorefrontError(response: Response): Promise<ApiError> {
  let envelope: { error?: { code?: string; message?: string; details?: unknown } } = {};
  try {
    envelope = (await response.json()) as typeof envelope;
  } catch {
    // Non-JSON error body.
  }
  return new ApiError(envelope.error?.message ?? `Request failed (${response.status}).`, {
    code: envelope.error?.code ?? 'REQUEST_FAILED',
    status: response.status,
    details: envelope.error?.details,
  });
}

/** Builds the store-scoped media content URL (tenant isolation is server-side). */
export function storefrontMediaUrl(slug: string, mediaId: string): string {
  return `${appConfig.apiUrl}/storefront/media/${encodeURIComponent(mediaId)}/content`;
}

const mediaBlobCache = new Map<string, string>();

/**
 * Fetches a store media binary THROUGH the header-based storefront API
 * (X-Storefront-Slug — the only tenant-resolution mechanism) and returns an
 * object URL suitable for `<img src>`. Blob URLs are cached per media id so
 * product galleries / logos request each asset once. No cross-tenant media can
 * ever be requested: the backend resolves the media row store-scoped.
 */
export async function storefrontMediaUrlForSlug(slug: string, mediaId: string): Promise<string> {
  const cached = mediaBlobCache.get(mediaId);
  if (cached) return cached;

  const response = await fetch(storefrontMediaUrl(slug, mediaId), {
    headers: { 'X-Storefront-Slug': slug },
  });
  if (!response.ok) {
    return '';
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  mediaBlobCache.set(mediaId, url);
  return url;
}

/**
 * Public storefront read client. Every method takes the storefront `slug`
 * (from the URL) and the backend resolves the store from the
 * `X-Storefront-Slug` header — never from a client-supplied store id.
 */
export const storefrontApi = {
  getStore: (slug: string) => storefrontFetch<Envelope<StorefrontStore>>(slug, '/storefront'),

  listProducts: (slug: string, params: { page?: number; limit?: number; search?: string } = {}) =>
    storefrontFetch<Paginated<StorefrontProduct>>(slug, '/storefront/products', {
      query: { page: params.page, limit: params.limit, search: params.search },
    }),

  getProductBySlug: (slug: string, productSlug: string) =>
    storefrontFetch<Envelope<StorefrontProduct>>(
      slug,
      `/storefront/products/${encodeURIComponent(productSlug)}`,
    ),

  /**
   * Paginated storefront gallery (Phase 26). `variantId` filters to the images
   * linked to a specific variant. Returns ordered associations so the client
   * can render variant-aware galleries with a product-level fallback.
   */
  listProductMedia: (
    slug: string,
    productSlug: string,
    params: { page?: number; limit?: number; variantId?: string } = {},
  ) =>
    storefrontFetch<Paginated<StorefrontProductMedia>>(
      slug,
      `/storefront/products/${encodeURIComponent(productSlug)}/media`,
      { query: { page: params.page, limit: params.limit, variantId: params.variantId } },
    ),

  listCategories: (slug: string, params: { page?: number; limit?: number } = {}) =>
    storefrontFetch<Paginated<StorefrontCategory>>(slug, '/storefront/categories', {
      query: { page: params.page, limit: params.limit },
    }),

  getCategoryBySlug: (slug: string, categorySlug: string) =>
    storefrontFetch<Envelope<StorefrontCategoryDetail>>(
      slug,
      `/storefront/categories/${encodeURIComponent(categorySlug)}`,
    ),

  getPageBySlug: (slug: string, pageSlug: string) =>
    storefrontFetch<Envelope<StorefrontPage>>(slug, `/storefront/pages/${encodeURIComponent(pageSlug)}`),

  getTheme: (slug: string) => storefrontFetch<Envelope<StorefrontTheme>>(slug, '/storefront/theme'),

  getNavigation: (slug: string) =>
    storefrontFetch<Envelope<StorefrontNavigation>>(slug, '/storefront/navigation'),
};
