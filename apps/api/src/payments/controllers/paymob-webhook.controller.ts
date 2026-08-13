import { Body, Controller, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PaymobWebhookService } from '../services/paymob-webhook.service';

/**
 * Paymob payment webhook (docs/API-SPEC.md §24 "Payment Webhook"):
 *
 *   POST /api/v1/webhooks/paymob
 *
 * The webhook has NO merchant authentication context by design: it is
 * `@Public()` (AuthGuard/TenantContextGuard/RolesGuard all skip it). Provider
 * authenticity is verified via the Paymob HMAC signature and the tenant is
 * derived server-side from the resolved payment (DATABASE §16.5/§29.2) —
 * never from client input.
 *
 * The endpoint returns a safe response to the provider (200) for every
 * verified event, including ones that cannot be resolved (marked ERROR for
 * the retry scan). Invalid signatures are rejected with 400.
 */
@Controller('webhooks')
export class PaymobWebhookController {
  constructor(private readonly webhook: PaymobWebhookService) {}

  @Public()
  @Post('paymob')
  @HttpCode(HttpStatus.OK)
  async handle(@Body() body: unknown, @Query('hmac') hmac: string | undefined) {
    const result = await this.webhook.processWebhook(body, hmac);
    return { data: result };
  }
}
