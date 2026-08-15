import { api } from './client';
import type { Envelope, ThemeView, UpdateThemeInput } from './types';

/**
 * Theme API — GET/PUT /api/v1/theme (docs/API-SPEC.md §28).
 * The theme is a singleton per store: colors, typography, logo reference.
 */
export const themeApi = {
  getTheme: () => api.get<Envelope<ThemeView>>('/theme'),

  updateTheme: (input: UpdateThemeInput) => api.put<Envelope<ThemeView>>('/theme', input),
};
