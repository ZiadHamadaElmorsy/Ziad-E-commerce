import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { SkipTenantContext } from '../../common/decorators/skip-tenant-context.decorator';
import { CreateStoreDto } from '../dto/create-store.dto';
import { UpdateStoreDto } from '../dto/update-store.dto';
import { StoreService } from '../services/store.service';

/**
 * Store API — Phase 2 Identity & Tenancy endpoints (docs/API-SPEC.md §15).
 *
 * Thin controller: all business logic lives in StoreService.
 *
 *   POST /api/v1/stores            create store + OWNER membership
 *   GET  /api/v1/stores/current    read the store resolved from the tenant context
 *   PATCH /api/v1/stores/current   update the current store (tenant-safe)
 */
@Controller('stores')
export class StoresController {
  constructor(private readonly storeService: StoreService) {}

  /**
   * Store creation is deliberately exempt from tenant-context resolution
   * (@SkipTenantContext): a merchant creating their first store has no
   * membership yet. Authentication still applies.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @SkipTenantContext()
  async create(@Body() dto: CreateStoreDto) {
    const store = await this.storeService.createStore(dto);
    return { data: store };
  }

  @Get('current')
  async getCurrent() {
    const store = await this.storeService.getCurrentStore();
    return { data: store };
  }

  @Patch('current')
  async updateCurrent(@Body() dto: UpdateStoreDto) {
    const store = await this.storeService.updateCurrentStore(dto);
    return { data: store };
  }
}
