import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersModule } from '../orders/orders.module';
import { BostaWebhookController } from './controllers/bosta-webhook.controller';
import { ShipmentsController } from './controllers/shipments.controller';
import { BostaShippingProvider } from './providers/bosta/bosta-shipping-provider';
import { ShippingProvider } from './providers/shipping-provider';
import { ShipmentRepository } from './repositories/shipment.repository';
import { ShipmentsService } from './services/shipments.service';
import { ShippingWebhookService } from './services/shipping-webhook.service';

/**
 * Shipping module (Phase 27).
 *
 * Implements the carrier shipping domain BEHIND the ShippingProvider
 * abstraction (Part 8):
 *
 *   Merchant:  POST/GET /orders/:orderId/shipment(/, /refresh, /cancel, /label)
 *   Webhook:   POST /webhooks/bosta
 *   Customer:  via StorefrontCommerceService -> ShipmentsService.getCustomerTracking
 *
 * The Orders domain is NOT coupled to Bosta: the module binds the
 * ShippingProvider abstraction to the Bosta adapter via dependency injection.
 * J&T or any future carrier is added by registering a new adapter — no order
 * or customer-surface redesign.
 *
 * The module reuses OrderRepository (exported by OrdersModule) for order
 * ownership + payment-status transitions; it never writes order lifecycle
 * state directly except the guarded delivery transitions owned by this flow.
 */
@Module({
  imports: [OrdersModule, InventoryModule],
  controllers: [ShipmentsController, BostaWebhookController],
  providers: [
    ShipmentsService,
    ShippingWebhookService,
    ShipmentRepository,
    { provide: ShippingProvider, useClass: BostaShippingProvider },
  ],
  exports: [ShipmentsService],
})
export class ShippingModule {}
