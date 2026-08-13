import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { HEX_COLOR_PATTERN, MAX_FONT_FAMILY_LENGTH } from '../domain/cms-theme';

/**
 * PUT /api/v1/theme request body (docs/API-SPEC.md §28 "Update Theme
 * Configuration"). The API-SPEC example is:
 *
 *   { "primaryColor": "#000000", "fontFamily": "Inter" }
 *
 * - `primaryColor` must be a 6-digit hex color (technical validation; no
 *   color schema is documented beyond the example).
 * - `logoMediaId` references an existing Media row of the SAME store
 *   (theme_configurations.logo_media_id — DATABASE §7.24). Binary uploads are
 *   a Media-phase (Phase 13) concern; this phase only manages the reference.
 */
export class UpdateThemeDto {
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_PATTERN)
  primaryColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_FONT_FAMILY_LENGTH)
  fontFamily?: string;

  @IsOptional()
  @IsString()
  logoMediaId?: string;
}
