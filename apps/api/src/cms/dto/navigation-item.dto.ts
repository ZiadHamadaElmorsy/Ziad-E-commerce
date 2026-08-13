import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { NAVIGATION_ITEM_TYPES } from '../domain/cms-navigation';

/**
 * A single navigation item (docs/DATABASE.md §7.23/§21.2 — "label +
 * slug/id"). `value` carries the page/category id or the destination slug.
 */
export class NavigationItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  label!: string;

  @IsIn(NAVIGATION_ITEM_TYPES)
  type!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  value!: string;
}
