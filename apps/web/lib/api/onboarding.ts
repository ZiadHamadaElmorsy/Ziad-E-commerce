import { api } from './client';
import type {
  CreateMerchantInput,
  CreateMerchantResult,
  Envelope,
  OnboardingStatus,
} from './types';

/**
 * Merchant onboarding API (Phase 17).
 *
 *   POST /api/v1/onboarding/merchant   idempotent creation of the application
 *                                        User + Store + OWNER membership.
 *   GET  /api/v1/onboarding/status     current merchant state for routing
 *                                        (used when /auth/me cannot resolve a
 *                                        tenant yet — e.g. no store exists).
 *
 * Both endpoints require an authenticated Supabase session; they never accept
 * a store id from the client.
 */
export const onboardingApi = {
  createMerchant: (input: CreateMerchantInput) =>
    api.post<Envelope<CreateMerchantResult>>('/onboarding/merchant', input),

  getStatus: () => api.get<Envelope<OnboardingStatus>>('/onboarding/status'),
};
