import { ValidationError } from '../../common/errors/domain-exceptions';
import { assertValidPrimaryColor, buildThemeConfig, DEFAULT_THEME_CONFIG } from './cms-theme';

describe('cms-theme (theme config)', () => {
  it('default theme config is an empty JSON object (no invented defaults)', () => {
    expect(DEFAULT_THEME_CONFIG).toEqual({});
  });

  it('builds the documented config from primaryColor + fontFamily', () => {
    expect(buildThemeConfig({ primaryColor: '#000000', fontFamily: 'Inter' })).toEqual({
      primaryColor: '#000000',
      fontFamily: 'Inter',
    });
  });

  it('builds a partial config (PUT replaces the stored config)', () => {
    expect(buildThemeConfig({ primaryColor: '#ffffff' })).toEqual({ primaryColor: '#ffffff' });
    expect(buildThemeConfig({ fontFamily: 'Inter' })).toEqual({ fontFamily: 'Inter' });
    expect(buildThemeConfig({})).toEqual({});
  });

  it('accepts any 6-digit hex color (case-insensitive)', () => {
    expect(() => assertValidPrimaryColor('#000000')).not.toThrow();
    expect(() => assertValidPrimaryColor('#AaBbCc')).not.toThrow();
    expect(() => assertValidPrimaryColor('#F00F00')).not.toThrow();
  });

  it.each(['#000', 'red', '#00000000', '000000', ''])(
    'rejects invalid primaryColor (%p)',
    (color) => {
      expect(() => buildThemeConfig({ primaryColor: color })).toThrow(ValidationError);
    },
  );
});
