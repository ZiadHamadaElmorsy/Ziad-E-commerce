import { api, toQueryString } from './client';
import type { Envelope, InventoryView, MovementView, Paginated } from './types';

/**
 * Inventory API — every call hits the real backend
 * (GET/POST /api/v1/variants/:variantId/inventory*, docs/API-SPEC.md §19).
 */
export const inventoryApi = {
  getInventory: (variantId: string) =>
    api.get<Envelope<InventoryView>>(`/variants/${variantId}/inventory`),

  adjust: (variantId: string, input: { quantity: number; reason: string }) =>
    api.post<Envelope<InventoryView>>(`/variants/${variantId}/inventory/adjust`, input),

  listMovements: (variantId: string, params: { page?: number; limit?: number } = {}) =>
    api.get<Paginated<MovementView>>(
      `/variants/${variantId}/inventory/movements${toQueryString({ ...params })}`,
    ),
};
