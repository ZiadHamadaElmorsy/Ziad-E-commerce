import { api } from './client';
import type { Envelope, SubscriptionView } from './types';

/**
 * Subscription API — GET /api/v1/subscription (docs/API-SPEC.md §30).
 * The backend stays authoritative for access control; the UI only displays
 * the real subscription state (TRIAL / ACTIVE / EXPIRED).
 */
export const subscriptionApi = {
  getCurrent: () => api.get<Envelope<SubscriptionView>>('/subscription'),
};
