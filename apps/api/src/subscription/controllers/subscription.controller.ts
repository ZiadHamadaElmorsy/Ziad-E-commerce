import { Controller, Get } from '@nestjs/common';
import { SubscriptionService } from '../services/subscription.service';
import { SubscriptionView } from '../subscription.types';

/**
 * Subscription API (docs/API-SPEC.md §30) — the exact documented endpoint:
 *
 *   GET /api/v1/subscription   Get Current Subscription
 *
 * Thin controller; authenticated + tenant-scoped through the global guard
 * chain. The store comes from the trusted tenant context, never from client
 * input. The response exposes TRIAL / ACTIVE / EXPIRED; the backend remains
 * authoritative for access control (the frontend is never trusted).
 *
 * This is the ONLY documented Subscription endpoint — lifecycle transitions
 * (activation/reactivation) have no documented API trigger and are therefore
 * NOT exposed.
 */
@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly subscriptions: SubscriptionService) {}

  @Get()
  async getCurrent(): Promise<{ data: SubscriptionView }> {
    const subscription = await this.subscriptions.getCurrent();
    return { data: subscription };
  }
}
