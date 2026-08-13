import { Body, Controller, Get, Put } from '@nestjs/common';
import { NavigationService } from '../services/navigation.service';
import { UpdateNavigationDto } from '../dto/update-navigation.dto';

/**
 * Navigation API (docs/API-SPEC.md §27 "Navigation API").
 *
 * Navigation is a singleton store resource: GET returns the store's current
 * navigation (a default is materialized when absent) and PUT replaces it.
 * Every route is authenticated + tenant-scoped.
 */
@Controller('navigation')
export class NavigationController {
  constructor(private readonly navigation: NavigationService) {}

  @Get()
  async get() {
    const navigation = await this.navigation.getNavigation();
    return { data: navigation };
  }

  @Put()
  async update(@Body() dto: UpdateNavigationDto) {
    const navigation = await this.navigation.updateNavigation(dto);
    return { data: navigation };
  }
}
