import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { CustomerModule } from '../customer/customer.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CheckoutController } from './controllers/checkout.controller';
import { OrderRepository } from './repositories/order.repository';
import { CheckoutService } from './services/checkout.service';

/**
 * Checkout module (Phase 7).
 *
 * Implements the Checkout API (docs/API-SPEC.md §22): POST /checkout.
 *
 * Controller -> Service -> Repository -> Database.
 * Business rules live in the service/domain layer; controllers stay thin.
 *
 * Checkout is an orchestration boundary (docs/DOMAIN-MODEL.md §11) — no
 * checkout table or entity exists. The module reuses:
 *   - CartModule      (CartRepository/CartItemRepository: load + complete the cart)
 *   - InventoryModule (InventoryReservationService.reserveTx: atomic reservation;
 *                      InventoryReservationRepository.linkOrderForCart)
 *   - CustomerModule  (CustomerRepository: find-or-create the Store-scoped customer)
 *
 * Only the MINIMAL Order persistence required by the Checkout contract lives
 * here (OrderRepository). The complete Orders module and the Payment phase are
 * explicitly NOT implemented (roadmap Phase 9 / Phase 10).
 */
@Module({
  imports: [CartModule, InventoryModule, CustomerModule],
  controllers: [CheckoutController],
  providers: [CheckoutService, OrderRepository],
  exports: [CheckoutService],
})
export class CheckoutModule {}
