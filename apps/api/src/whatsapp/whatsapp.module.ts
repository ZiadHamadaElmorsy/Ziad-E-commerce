import { Module } from '@nestjs/common';
import { CheckoutModule } from '../checkout/checkout.module';
import { CustomerModule } from '../customer/customer.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { StoreSettingsModule } from '../store-settings/store-settings.module';
import { StorefrontModule } from '../storefront/storefront.module';
import { WhatsappService } from './services/whatsapp.service';

/**
 * WhatsApp ordering module (Phase 22).
 *
 * Implements the "Order via WhatsApp" fallback: a REAL order is created through
 * the existing Checkout pipeline (server-side revalidation), then WhatsApp
 * opens with a pre-filled order message. The module is a thin orchestration
 * layer over the existing Checkout / Orders / Payments / Customer / Storefront
 * / StoreSettings domains — no duplicate order, cart or payment systems.
 *
 * The store is ALWAYS resolved server-side by the existing
 * StorefrontStoreResolver; the WhatsApp number comes from the merchant's own
 * store-scoped settings (StoreSettingsService). No client-supplied store id or
 * WhatsApp number is ever accepted.
 */
@Module({
  imports: [
    StorefrontModule,
    CheckoutModule,
    OrdersModule,
    CustomerModule,
    PaymentsModule,
    StoreSettingsModule,
  ],
  providers: [WhatsappService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
