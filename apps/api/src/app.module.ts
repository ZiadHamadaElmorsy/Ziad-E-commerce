import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { validate } from './config/env.validation';
import configuration from './config/configuration';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { RequestContextModule } from './common/context/request-context.module';
import { InfrastructureModule } from './infrastructure/database/infrastructure.module';
import { AuthModule } from './auth/auth.module';
import { TenantModule } from './tenant/tenant.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { IdentityModule } from './identity/identity.module';
import { CatalogModule } from './catalog/catalog.module';
import { InventoryModule } from './inventory/inventory.module';
import { CustomerModule } from './customer/customer.module';
import { CartModule } from './cart/cart.module';
import { CheckoutModule } from './checkout/checkout.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { StorefrontModule } from './storefront/storefront.module';
import { CmsModule } from './cms/cms.module';
import { MediaModule } from './media/media.module';
import { SubscriptionModule } from './subscription/subscription.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Prefer the repository-root `.env` (canonical), fall back to a local `.env`.
      envFilePath: [resolve(process.cwd(), '../../.env'), resolve(process.cwd(), '.env')],
      load: [configuration],
      validate,
    }),
    // Foundation order matters for the global guards:
    // RequestContext (middleware) -> AuthGuard -> TenantContextGuard -> RolesGuard.
    RequestContextModule,
    InfrastructureModule,
    AuthModule,
    TenantModule,
    AuthorizationModule,
    PrismaModule,
    HealthModule,
    IdentityModule,
    CatalogModule,
    InventoryModule,
    CustomerModule,
    CartModule,
    CheckoutModule,
    OrdersModule,
    PaymentsModule,
    // The Subscription access guard is registered AFTER RolesGuard so the
    // guard chain is:
    //   RequestContext -> AuthGuard -> TenantContextGuard -> RolesGuard
    //   -> SubscriptionAccessGuard
    SubscriptionModule,
    StorefrontModule,
    CmsModule,
    MediaModule,
  ],
})
export class AppModule {}
