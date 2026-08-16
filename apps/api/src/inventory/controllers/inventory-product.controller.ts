import { Controller, Get, Param } from '@nestjs/common';
import { InventoryService } from '../services/inventory.service';

/**
 * Product-scoped inventory read (Phase 25 — performance audit).
 *
 *   GET /api/v1/products/:productId/inventory
 *
 * Lives in the Inventory module (which owns the inventory domain) but serves
 * under `/products/:productId/inventory` so the product edit screen can load
 * every variant's inventory with ONE request instead of N per-variant calls.
 * Thin controller — all business logic (tenant scoping, fail-closed product
 * resolution, batch read) lives in InventoryService.
 */
@Controller('products')
export class InventoryProductController {
  constructor(private readonly inventory: InventoryService) {}

  @Get(':productId/inventory')
  async listByProduct(@Param('productId') productId: string) {
    const items = await this.inventory.listByProduct(productId);
    return { data: items };
  }
}
