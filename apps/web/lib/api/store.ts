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

/** Store-scoped WhatsApp ordering configuration (Phase 22). */
export interface WhatsAppSettingsView {
  whatsapp: {
    enabled: boolean;
    phoneNumber: string;
    label: string | null;
  };
}

export interface UpdateWhatsAppSettingsInput {
  whatsapp: {
    enabled: boolean;
    phoneNumber: string;
    label?: string;
  };
}

/**
 * Store API — GET/PATCH /api/v1/stores/current (docs/API-SPEC.md §15).
 * The current store is always resolved from the trusted tenant context.
 * Phase 22 adds the store-scoped WhatsApp settings endpoints.
 */
export const storeApi = {
  getCurrentStore: () => api.get<Envelope<StoreView>>('/stores/current'),

  updateCurrentStore: (input: { name: string }) =>
    api.patch<Envelope<StoreView>>('/stores/current', input),

  getWhatsAppSettings: () =>
    api.get<Envelope<WhatsAppSettingsView>>('/stores/current/settings/whatsapp'),

  updateWhatsAppSettings: (input: UpdateWhatsAppSettingsInput) =>
    api.put<Envelope<WhatsAppSettingsView>>('/stores/current/settings/whatsapp', input),
};
