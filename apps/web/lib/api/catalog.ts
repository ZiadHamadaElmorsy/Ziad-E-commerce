import { api, toQueryString } from './client';
import type {
  AttachProductMediaInput,
  CategoryView,
  CreateCategoryInput,
  CreateProductInput,
  CreateVariantInput,
  Envelope,
  ListCategoriesParams,
  ListProductMediaParams,
  ListProductsParams,
  Paginated,
  ProductLinkInput,
  ProductMediaView,
  ProductView,
  UpdateCategoryInput,
  UpdateProductInput,
  UpdateProductMediaInput,
  UpdateVariantInput,
  VariantView,
} from './types';

/**
 * Catalog API calls — every function hits the real backend
 * (NEXT_PUBLIC_API_URL) with the authenticated session's access token.
 */
export const catalogApi = {
  // --- Products ---
  listProducts: (params: ListProductsParams = {}) =>
    api.get<Paginated<ProductView>>(`/products${toQueryString({ ...params })}`),

  getProduct: (productId: string) => api.get<Envelope<ProductView>>(`/products/${productId}`),

  createProduct: (input: CreateProductInput) => api.post<Envelope<ProductView>>('/products', input),

  updateProduct: (productId: string, input: UpdateProductInput) =>
    api.patch<Envelope<ProductView>>(`/products/${productId}`, input),

  publishProduct: (productId: string) =>
    api.post<Envelope<ProductView>>(`/products/${productId}/publish`),

  unpublishProduct: (productId: string) =>
    api.post<Envelope<ProductView>>(`/products/${productId}/unpublish`),

  archiveProduct: (productId: string) =>
    api.post<Envelope<ProductView>>(`/products/${productId}/archive`),

  // --- Product gallery (Phase 26) ---
  listProductMedia: (productId: string, params: ListProductMediaParams = {}) =>
    api.get<Paginated<ProductMediaView>>(`/products/${productId}/media${toQueryString({ ...params })}`),

  updateProductMedia: (productId: string, mediaId: string, input: UpdateProductMediaInput) =>
    api.patch<Envelope<ProductView>>(`/products/${productId}/media/${mediaId}`, input),

  reorderProductMedia: (productId: string, mediaIds: string[]) =>
    api.put<Envelope<ProductView>>(`/products/${productId}/media/order`, { order: mediaIds }),

  // --- Product images (product_media association) ---
  attachMedia: (productId: string, mediaId: string, input: AttachProductMediaInput = {}) =>
    api.post<Envelope<ProductView>>(`/products/${productId}/media/${mediaId}`, input),

  removeMedia: (productId: string, mediaId: string) =>
    api.delete<void>(`/products/${productId}/media/${mediaId}`),

  // --- Variants ---
  createVariant: (productId: string, input: CreateVariantInput) =>
    api.post<Envelope<VariantView>>(`/products/${productId}/variants`, input),

  updateVariant: (variantId: string, input: UpdateVariantInput) =>
    api.patch<Envelope<VariantView>>(`/variants/${variantId}`, input),

  archiveVariant: (variantId: string) =>
    api.post<Envelope<VariantView>>(`/variants/${variantId}/archive`),

  // --- Product <-> Category links ---
  listProductCategories: (productId: string) =>
    api.get<Envelope<CategoryView[]>>(`/products/${productId}/categories`),

  assignCategory: (productId: string, categoryId: string) =>
    api.post<Envelope<ProductLinkInput>>(`/products/${productId}/categories/${categoryId}`),

  removeCategory: (productId: string, categoryId: string) =>
    api.delete<Envelope<ProductLinkInput>>(`/products/${productId}/categories/${categoryId}`),

  // --- Categories ---
  listCategories: (params: ListCategoriesParams = {}) =>
    api.get<Paginated<CategoryView>>(`/categories${toQueryString({ ...params })}`),

  getCategory: (categoryId: string) => api.get<Envelope<CategoryView>>(`/categories/${categoryId}`),

  createCategory: (input: CreateCategoryInput) =>
    api.post<Envelope<CategoryView>>('/categories', input),

  updateCategory: (categoryId: string, input: UpdateCategoryInput) =>
    api.patch<Envelope<CategoryView>>(`/categories/${categoryId}`, input),

  archiveCategory: (categoryId: string) =>
    api.post<Envelope<CategoryView>>(`/categories/${categoryId}/archive`),
};
