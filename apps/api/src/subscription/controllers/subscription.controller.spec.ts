import { SubscriptionStatus } from '@prisma/client';
import { SubscriptionService } from '../services/subscription.service';
import { SubscriptionController } from './subscription.controller';

describe('SubscriptionController', () => {
  let subscriptions: { getCurrent: jest.Mock };
  let controller: SubscriptionController;

  beforeEach(() => {
    subscriptions = { getCurrent: jest.fn() };
    controller = new SubscriptionController(subscriptions as unknown as SubscriptionService);
  });

  it('GET /subscription returns the current subscription view (docs/API-SPEC.md §30)', async () => {
    const view = {
      id: 'sub-1',
      status: SubscriptionStatus.TRIAL,
      trialStartedAt: new Date('2026-08-12T00:00:00Z'),
      trialEndsAt: new Date('2026-08-26T00:00:00Z'),
      activatedAt: null,
      expiresAt: null,
      createdAt: new Date('2026-08-12T00:00:00Z'),
      updatedAt: new Date('2026-08-12T00:00:00Z'),
    };
    subscriptions.getCurrent.mockResolvedValue(view);

    const result = await controller.getCurrent();

    expect(result).toEqual({ data: view });
    expect(subscriptions.getCurrent).toHaveBeenCalledTimes(1);
  });
});
