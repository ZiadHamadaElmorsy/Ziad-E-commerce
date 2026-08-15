import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { CheckoutModule } from '../checkout/checkout.module';
import { CmsModule } from '../cms/cms.module';
import { MediaModule } from '../media/media.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { StoreSettingsModule } from '../store-settings/store-settings.module';
import { StorefrontModule } from '../storefront/storefront.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { StorefrontCommerceController } from './controllers/storefront-commerce.controller';
import { StorefrontCommerceService } from './services/storefront-commerce.service';

/**
 * Storefront commerce module (Phase 19).
 *
 * Implements the PUBLIC guest-customer commerce surface for the storefront
 * (docs/API-SPEC.md §36 "Public": cart operations where guest sessions are
 * supported, checkout initiation, payment redirect/result endpoints). It is a
 * thin bridge: every business rule lives in the EXISTING modules (Cart,
 * Checkout, Orders, Payments, CMS, Media, Storefront), and the Store is always
 * resolved server-side by the existing StorefrontStoreResolver.
 *
 *   Controller -> Service -> existing domain services / repositories
 */
@Module({
  imports: [
    StorefrontModule,
    CartModule,
    CheckoutModule,
    OrdersModule,
    PaymentsModule,
    StoreSettingsModule,
    WhatsappModule,
    CmsModule,
    MediaModule,
  ],
  controllers: [StorefrontCommerceController],
  providers: [StorefrontCommerceService],
})
export class StorefrontCommerceModule {}
