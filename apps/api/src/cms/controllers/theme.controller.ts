import { Body, Controller, Get, Put } from '@nestjs/common';
import { ThemeService } from '../services/theme.service';
import { UpdateThemeDto } from '../dto/update-theme.dto';

/**
 * Theme API (docs/API-SPEC.md §28 "Theme API").
 *
 * The theme is a singleton 1:1 store resource: GET returns the store's
 * current configuration (default materialized when absent) and PUT replaces
 * it. Every route is authenticated + tenant-scoped.
 */
@Controller('theme')
export class ThemeController {
  constructor(private readonly theme: ThemeService) {}

  @Get()
  async get() {
    const theme = await this.theme.getTheme();
    return { data: theme };
  }

  @Put()
  async update(@Body() dto: UpdateThemeDto) {
    const theme = await this.theme.updateTheme(dto);
    return { data: theme };
  }
}
