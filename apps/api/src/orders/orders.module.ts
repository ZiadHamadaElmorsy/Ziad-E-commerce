import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersController } from './controllers/orders.controller';
import { AuditLogRepository } from './repositories/audit-log.repository';
import { OrderRepository } from './repositories/order.repository';
import { OrdersService } from './services/orders.service';

/**
 * Orders module (Phase 8).
 *
 * Implements the merchant Order API (docs/API-SPEC.md §23): list orders, get
 * order details, update order status — over the PENDING orders that the
 * Checkout phase creates.
 *
 * Controller -> Service -> Repository -> Database.
 * Business rules live in the service/domain layer; controllers stay thin.
 *
 * Order CREATION remains owned by CheckoutModule (its OrderRepository creates
 * the PENDING order + snapshot items + order_number + reservation linking);
 * this module consumes and manages those records and never duplicates
 * creation. The module reuses:
 *   - InventoryModule (InventoryReservationService.releaseAllForOrderTx:
 *                      documented cancellation reservation release, §28.4)
 *   - IdentityModule  (UserRepository: audit actor resolution)
 *
 * Payments are NOT part of this phase: no payment records, providers,
 * intents, webhooks or refunds. The documented reservation CONSUMPTION path
 * (payment success -> ACTIVE -> CONSUMED, order PENDING -> CONFIRMED) belongs
 * to the Payments phase.
 */
@Module({
  imports: [InventoryModule, IdentityModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderRepository, AuditLogRepository],
  // OrderRepository + AuditLogRepository are exported as transaction-scoped
  // primitives for the Payments phase: payment success drives the guarded
  // PENDING -> CONFIRMED transition and writes the audit trail INSIDE the
  // payment webhook transaction (DATABASE §28.2) while keeping the Orders
  // domain the owner of the order lifecycle rules (never a Payments-layer
  // direct order write).
  exports: [OrdersService, OrderRepository, AuditLogRepository],
})
export class OrdersModule {}
