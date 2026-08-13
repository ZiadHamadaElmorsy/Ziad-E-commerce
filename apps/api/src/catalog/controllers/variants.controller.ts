import { Body, Controller, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { VariantsService } from '../services/variants.service';
import { UpdateVariantDto } from '../dto/update-variant.dto';

/**
 * Variant API — update/archive routes that are NOT nested under a product
 * (docs/API-SPEC.md §17 "Update Variant", "Archive Variant").
 *
 * Thin controller; every route is authenticated + tenant-scoped.
 */
@Controller('variants')
export class VariantsController {
  constructor(private readonly variants: VariantsService) {}

  @Patch(':variantId')
  async update(@Param('variantId') variantId: string, @Body() dto: UpdateVariantDto) {
    const variant = await this.variants.update(variantId, dto);
    return { data: variant };
  }

  @Post(':variantId/archive')
  @HttpCode(HttpStatus.OK)
  async archive(@Param('variantId') variantId: string) {
    const variant = await this.variants.archive(variantId);
    return { data: variant };
  }
}
