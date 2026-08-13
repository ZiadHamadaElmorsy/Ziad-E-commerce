import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CartController } from './controllers/cart.controller';
import { CartItemRepository } from './repositories/cart-item.repository';
import { CartRepository } from './repositories/cart.repository';
import { CartService } from './services/cart.service';

/**
 * Cart module (Phase 6).
 *
 * Implements the Cart API (docs/API-SPEC.md §21): GET /cart, POST /cart/items,
 * PATCH /cart/items/:itemId, DELETE /cart/items/:itemId, DELETE /cart/items.
 *
 * Controller -> Service -> Repository -> Database.
 * Business rules live in the service/domain layer; controllers stay thin.
 *
 * The module reuses the Catalog ProductVariantRepository + ProductRepository
 * (variant/product ownership and purchasability are never duplicated) and the
 * Inventory InventoryService (availability is validated but inventory is NOT
 * reserved — reservation belongs to checkout). CartService + the Cart
 * repositories are exported as the integration boundary for the Checkout phase
 * (API-SPEC §22 "Create Checkout" loads the Cart and completes it).
 */
@Module({
  imports: [CatalogModule, InventoryModule],
  controllers: [CartController],
  providers: [CartService, CartRepository, CartItemRepository],
  exports: [CartService, CartRepository, CartItemRepository],
})
export class CartModule {}
