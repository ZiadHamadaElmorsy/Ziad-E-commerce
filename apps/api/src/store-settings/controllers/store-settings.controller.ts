import { Body, Controller, Get, HttpCode, HttpStatus, Put } from '@nestjs/common';
import { UpdateWhatsAppSettingsDto } from '../dto/update-whatsapp-settings.dto';
import { StoreSettingsService } from '../services/store-settings.service';

/**
 * Store settings API (Phase 22 — WhatsApp ordering):
 *
 *   GET /api/v1/stores/current/settings/whatsapp   read WhatsApp config
 *   PUT /api/v1/stores/current/settings/whatsapp   update WhatsApp config
 *
 * Both routes are merchant-authenticated and tenant-scoped through the global
 * guard chain: the store id comes from the trusted tenant context
 * (membership -> store), never from client input, so a merchant can only ever
 * read/modify their OWN WhatsApp configuration.
 */
@Controller('stores/current/settings')
export class StoreSettingsController {
  constructor(private readonly settings: StoreSettingsService) {}

  @Get('whatsapp')
  async getWhatsApp() {
    const result = await this.settings.getWhatsAppSettingsForCurrentStore();
    return { data: result };
  }

  @Put('whatsapp')
  @HttpCode(HttpStatus.OK)
  async updateWhatsApp(@Body() dto: UpdateWhatsAppSettingsDto) {
    const result = await this.settings.updateWhatsAppSettingsForCurrentStore(dto);
    return { data: result };
  }
}
