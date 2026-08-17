import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsController } from './controllers/payments.controller';
import { PaymobWebhookController } from './controllers/paymob-webhook.controller';
import { PaymentAttemptRepository } from './repositories/payment-attempt.repository';
import { PaymentEventRepository } from './repositories/payment-event.repository';
import { PaymentRepository } from './repositories/payment.repository';
import { PaymentsService } from './services/payments.service';
import { PaymobWebhookService } from './services/paymob-webhook.service';
import { PaymentProvider } from './providers/payment-provider';
import { PaymobPaymentProvider } from './providers/paymob/paymob-payment-provider';

/**
 * Payments module (Phase 9).
 *
 * Implements the Payment API (docs/API-SPEC.md §24) and the Paymob webhook
 * over the PENDING orders the Checkout phase creates:
 *
 *   POST /api/v1/orders/:orderId/payments   Create Payment Attempt
 *   GET  /api/v1/orders/:orderId/payment    Get Payment
 *   POST /api/v1/webhooks/paymob            Paymob webhook
 *
 * Controller -> Service -> Repository -> Database.
 * Business rules live in the service/domain layer; controllers stay thin.
 *
 * Boundaries respected:
 *   - Payments owns `payments` / `payment_attempts` / `payment_events`.
 *   - Orders owns the order lifecycle: this module reuses the Orders
 *     OrderRepository (guarded PENDING -> CONFIRMED) + AuditLogRepository
 *     inside the webhook transaction; it never writes `order.status` directly.
 *   - Inventory owns reservations: the module calls
 *     InventoryReservationService.consumeAllForOrderTx / releaseAllForOrderTx
 *     and never touches inventory tables.
 *   - The Order domain is NOT coupled to Paymob: the module binds the
 *     PaymentProvider abstraction to the Paymob adapter (DATABASE §16.2).
 */
@Module({
  imports: [OrdersModule, InventoryModule],
  controllers: [PaymentsController, PaymobWebhookController],
  providers: [
    PaymentsService,
    PaymobWebhookService,
    PaymentRepository,
    PaymentAttemptRepository,
    PaymentEventRepository,
    { provide: PaymentProvider, useClass: PaymobPaymentProvider },
  ],
  exports: [PaymentsService, PaymobWebhookService, PaymentEventRepository, PaymentProvider],
})
export class PaymentsModule {}
