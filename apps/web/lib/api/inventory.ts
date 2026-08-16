import { api, toQueryString } from './client';
import type { Envelope, InventoryView, MovementView, Paginated } from './types';

/**
 * Inventory API — every call hits the real backend
 * (GET/POST /api/v1/variants/:variantId/inventory*, docs/API-SPEC.md §19).
 * Phase 25 adds the aggregate product read (GET /api/v1/products/:productId/inventory)
 * so the product edit screen loads every variant's inventory with ONE request.
 */
export const inventoryApi = {
  getInventory: (variantId: string) =>
    api.get<Envelope<InventoryView>>(`/variants/${variantId}/inventory`),

  /** Aggregated inventory for ALL variants of one product (Phase 25). */
  listByProduct: (productId: string) =>
    api.get<Envelope<InventoryView[]>>(`/products/${productId}/inventory`),

  adjust: (variantId: string, input: { quantity: number; reason: string }) =>
    api.post<Envelope<InventoryView>>(`/variants/${variantId}/inventory/adjust`, input),

  listMovements: (variantId: string, params: { page?: number; limit?: number } = {}) =>
    api.get<Paginated<MovementView>>(
      `/variants/${variantId}/inventory/movements${toQueryString({ ...params })}`,
    ),
};
