import { SubscriptionStatus } from '@prisma/client';
import { toSubscriptionView } from './subscription.types';

describe('subscription view mapping', () => {
  it('maps the persisted row to the documented view without invented fields', () => {
    const row = {
      id: 'sub-1',
      storeId: 'store-1',
      status: SubscriptionStatus.ACTIVE,
      trialStartedAt: new Date('2026-08-12T00:00:00Z'),
      trialEndsAt: new Date('2026-08-26T00:00:00Z'),
      activatedAt: new Date('2026-08-20T00:00:00Z'),
      expiresAt: null,
      createdAt: new Date('2026-08-12T00:00:00Z'),
      updatedAt: new Date('2026-08-20T00:00:00Z'),
    };

    expect(toSubscriptionView(row as never)).toEqual({
      id: 'sub-1',
      status: SubscriptionStatus.ACTIVE,
      trialStartedAt: row.trialStartedAt,
      trialEndsAt: row.trialEndsAt,
      activatedAt: row.activatedAt,
      expiresAt: null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  });

  it('exposes the FINALIZED status so the frontend can determine TRIAL/ACTIVE/EXPIRED', () => {
    for (const status of Object.values(SubscriptionStatus)) {
      const view = toSubscriptionView({ id: 'sub-1', storeId: 'store-1', status } as never);
      expect(view.status).toBe(status);
    }
  });
});
