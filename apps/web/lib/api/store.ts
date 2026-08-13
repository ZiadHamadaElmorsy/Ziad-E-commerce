import { api } from './client';
import type { Envelope } from './types';

export interface StoreView {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  currency: string;
  timezone: string;
}

/**
 * Store API — GET/PATCH /api/v1/stores/current (docs/API-SPEC.md §15).
 * The current store is always resolved from the trusted tenant context.
 */
export const storeApi = {
  getCurrentStore: () => api.get<Envelope<StoreView>>('/stores/current'),

  updateCurrentStore: (input: { name: string }) =>
    api.patch<Envelope<StoreView>>('/stores/current', input),
};
