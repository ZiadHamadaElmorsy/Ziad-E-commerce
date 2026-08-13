import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { AdjustInventoryDto } from '../dto/adjust-inventory.dto';
import { ListMovementsQueryDto } from '../dto/list-movements-query.dto';
import { InventoryService } from '../services/inventory.service';

/**
 * Inventory API (docs/API-SPEC.md §19) — the only inventory endpoints defined
 * by the FINAL API contract:
 *
 *   GET  /api/v1/variants/:variantId/inventory           Get Variant Inventory
 *   POST /api/v1/variants/:variantId/inventory/adjust    Adjust Inventory
 *   GET  /api/v1/variants/:variantId/inventory/movements Get Inventory Movements
 *
 * Thin controller: all business logic lives in the services. Every route is
 * authenticated + tenant-scoped through the global guard chain; the trusted
 * store comes from the resolved tenant context, never from client input.
 *
 * Reservation operations are intentionally NOT exposed here (the API-SPEC
 * defines no reservation endpoints) — they are service-level boundaries for
 * the future checkout / payment phases.
 */
@Controller('variants')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get(':variantId/inventory')
  async getInventory(@Param('variantId') variantId: string) {
    const inventory = await this.inventory.getInventory(variantId);
    return { data: inventory };
  }

  @Post(':variantId/inventory/adjust')
  @HttpCode(HttpStatus.OK)
  async adjust(@Param('variantId') variantId: string, @Body() dto: AdjustInventoryDto) {
    const inventory = await this.inventory.adjust(variantId, dto);
    return { data: inventory };
  }

  @Get(':variantId/inventory/movements')
  async listMovements(
    @Param('variantId') variantId: string,
    @Query() query: ListMovementsQueryDto,
  ) {
    const { items, meta } = await this.inventory.listMovements(variantId, query);
    return { data: items, meta };
  }
}
