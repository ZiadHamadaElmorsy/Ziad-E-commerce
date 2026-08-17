import { Controller, Headers, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { BOSTA_SIGNATURE_HEADER } from '../providers/bosta/bosta-webhook-signature';
import { ShippingWebhookService } from '../services/shipping-webhook.service';

/** Express request with Nest's rawBody capture (NestFactory rawBody: true). */
interface RawBodyRequest extends Request {
  rawBody?: Buffer | string | Record<string, unknown>;
}

/**
 * Bosta delivery webhook (Phase 27 — Part 15):
 *
 *   POST /api/v1/webhooks/bosta
 *
 * The webhook has NO merchant authentication context by design: it is
 * `@Public()` (AuthGuard/TenantContextGuard/RolesGuard all skip it). Provider
 * authenticity is verified via the Bosta HMAC signature over the RAW body
 * (req.rawBody — enabled via NestFactory rawBody: true) and the tenant is
 * derived server-side from the resolved shipment's own store — never from
 * client input. A forged or cross-tenant event can never update another
 * store's shipment/order.
 *
 * The endpoint returns a safe 200 to the provider for every verified event,
 * including ones that cannot be resolved (the provider may retry). Invalid
 * signatures are rejected with 400 and are never processed.
 */
@Controller('webhooks')
export class BostaWebhookController {
  constructor(private readonly webhook: ShippingWebhookService) {}

  @Public()
  @Post('bosta')
  @HttpCode(HttpStatus.OK)
  async handle(
    @Req() request: RawBodyRequest,
    @Headers(BOSTA_SIGNATURE_HEADER) signature: string | undefined,
  ) {
    const rawBody = rawBodyString(request.rawBody);
    const result = await this.webhook.processWebhook(rawBody, signature);
    return { data: result };
  }
}

/** Nest's rawBody capture returns a Buffer (or string when already text). */
function rawBodyString(rawBody: unknown): string {
  if (Buffer.isBuffer(rawBody)) return rawBody.toString('utf8');
  if (typeof rawBody === 'string') return rawBody;
  if (rawBody !== undefined && rawBody !== null) {
    return JSON.stringify(rawBody);
  }
  return '';
}
