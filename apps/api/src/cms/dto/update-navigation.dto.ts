import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsString, MaxLength, ValidateNested } from 'class-validator';
import { NavigationItemDto } from './navigation-item.dto';

/**
 * PUT /api/v1/navigation request body (docs/API-SPEC.md §27 "Update
 * Navigation").
 *
 * PUT semantics: the whole navigation (name + ordered items) is replaced.
 * Items reference Pages, Categories and Storefront destinations
 * (label + slug/id — DATABASE §7.23/§21.2); the item shape is
 * { label, type: PAGE|CATEGORY|DESTINATION, value } — see
 * domain/cms-navigation.ts (OPEN DECISION in the Phase 12 report).
 */
export class UpdateNavigationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NavigationItemDto)
  items!: NavigationItemDto[];
}
