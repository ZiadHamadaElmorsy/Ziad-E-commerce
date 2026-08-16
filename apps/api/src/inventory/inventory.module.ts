import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { InventoryController } from './controllers/inventory.controller';
import { InventoryProductController } from './controllers/inventory-product.controller';
import { InventoryMovementRepository } from './repositories/inventory-movement.repository';
import { InventoryReservationRepository } from './repositories/inventory-reservation.repository';
import { InventoryRepository } from './repositories/inventory.repository';
import { InventoryReservationService } from './services/inventory-reservation.service';
import { InventoryService } from './services/inventory.service';

/**
 * Inventory module (Phase 4).
 *
 * Implements the merchant Inventory API (docs/API-SPEC.md §19) plus the
 * inventory reservation lifecycle services on top of the Phase 1-3 foundation.
 *
 * Controller -> Service -> Repository -> Database.
 * Business rules live in the service/domain layer; controllers stay thin.
 *
 * The module reuses the Catalog ProductVariantRepository (exported below) for
 * variant ownership resolution — variant rules are never duplicated.
 *
 * The reservation services are exported as the integration-ready boundary for
 * the future checkout / payment / order-cancellation phases (they are NOT
 * exposed through any HTTP endpoint in this phase — API-SPEC defines none).
 */
@Module({
  imports: [CatalogModule],
  controllers: [InventoryController, InventoryProductController],
  providers: [
    InventoryService,
    InventoryReservationService,
    InventoryRepository,
    InventoryReservationRepository,
    InventoryMovementRepository,
  ],
  exports: [InventoryService, InventoryReservationService, InventoryReservationRepository],
})
export class InventoryModule {}
