import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { GUEST_TOKEN_HEADER } from '../../cart/controllers/cart.controller';
import { CheckoutRequestDto } from '../dto/checkout-request.dto';
import { CheckoutService } from '../services/checkout.service';

/** Header carrying the optional client-generated checkout idempotency key
 * (docs/DATABASE.md §27.2 — client-supplied keys are honored for checkout). */
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

/**
 * Checkout API (docs/API-SPEC.md §22) — the exact documented endpoint:
 *
 *   POST /api/v1/checkout     Create Checkout
 *
 * Thin controller: all business logic lives in CheckoutService. The route is
 * authenticated + tenant-scoped through the global guard chain; the trusted
 * store comes from the resolved tenant context, never from client input. The
 * X-Guest-Token header only selects the cart INSIDE the trusted store, and the
 * optional Idempotency-Key header makes repeated checkout requests safe.
 */
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Headers(GUEST_TOKEN_HEADER) guestToken: string | undefined,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: string | undefined,
    @Body() dto: CheckoutRequestDto,
  ) {
    const result = await this.checkoutService.createCheckout(
      dto,
      this.normalizeToken(guestToken),
      this.normalizeIdempotencyKey(idempotencyKey),
    );
    return { data: result };
  }

  private normalizeToken(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
  }

  private normalizeIdempotencyKey(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
  }
}
