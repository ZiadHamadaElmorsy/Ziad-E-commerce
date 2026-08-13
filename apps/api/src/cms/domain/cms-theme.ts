import { ValidationError } from '../../common/errors/domain-exceptions';

/**
 * Theme configuration rules (docs/API-SPEC.md §28, docs/DATABASE.md §7.24).
 *
 * The API-SPEC PUT /theme request example is:
 *
 *   { "primaryColor": "#000000", "fontFamily": "Inter" }
 *
 * Those are the ONLY theme properties documented in the API contract; they
 * are stored inside the `config` jsonb column ("colors, typography, basic
 * layout settings" — DATABASE §7.24). The MVP-SCOPE/BRD list "primary colors,
 * typography, basic layout" as capabilities; the API-SPEC documents the two
 * concrete properties implemented here (reported as an OPEN DECISION in the
 * Phase 12 report).
 */

export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export const MAX_FONT_FAMILY_LENGTH = 100;

/** Default theme config for a newly materialized theme row (empty object). */
export const DEFAULT_THEME_CONFIG: Record<string, never> = {};

export function assertValidPrimaryColor(color: string): void {
  if (!HEX_COLOR_PATTERN.test(color)) {
    throw new ValidationError('primaryColor must be a 6-digit hex color (e.g. #000000).');
  }
}

export interface ThemeConfigInput {
  primaryColor?: string;
  fontFamily?: string;
}

/**
 * Builds the replacement `config` jsonb value for a PUT /theme request.
 *
 * PUT semantics: the stored config is exactly the documented keys sent in the
 * request body. Omitting a key removes it from the stored config (the response
 * of the previous PUT is the full contract for the next one).
 */
export function buildThemeConfig(input: ThemeConfigInput): Record<string, string> {
  const config: Record<string, string> = {};
  if (input.primaryColor !== undefined) {
    assertValidPrimaryColor(input.primaryColor);
    config.primaryColor = input.primaryColor;
  }
  if (input.fontFamily !== undefined) {
    config.fontFamily = input.fontFamily;
  }
  return config;
}
