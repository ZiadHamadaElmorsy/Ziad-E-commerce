import { Controller, Get, Headers, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { IDEMPOTENCY_KEY_HEADER } from '../../checkout/controllers/checkout.controller';
import { PaymentsService } from '../services/payments.service';

/**
 * Payment API (docs/API-SPEC.md §24) — the exact documented endpoints:
 *
 *   POST /api/v1/orders/:orderId/payments   Create Payment Attempt
 *   GET  /api/v1/orders/:orderId/payment    Get Payment
 *
 * Thin controller: all business logic lives in PaymentsService. Every route
 * is authenticated + tenant-scoped through the global guard chain; the
 * trusted store comes from the resolved tenant context, never from client
 * input. The Idempotency-Key header is required for payment initiation
 * (API-SPEC §24 — payment initiation is an idempotent critical write, §13).
 *
 * No request body is documented or accepted for payment creation: the store,
 * order, amount, currency and provider are all derived server-side. Any
 * client-supplied body is ignored — client-provided totals/statuses are never
 * trusted (API-SPEC §33).
 */
@Controller('orders')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post(':orderId/payments')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('orderId') orderId: string,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: string | undefined,
  ) {
    const payment = await this.payments.createPayment(orderId, this.normalize(idempotencyKey));
    return { data: payment };
  }

  @Get(':orderId/payment')
  async get(@Param('orderId') orderId: string) {
    const payment = await this.payments.getPayment(orderId);
    return { data: payment };
  }

  private normalize(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
  }
}
