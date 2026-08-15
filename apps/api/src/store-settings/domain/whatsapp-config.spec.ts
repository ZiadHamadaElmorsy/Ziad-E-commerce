import { ValidationError } from '../../common/errors/domain-exceptions';
import {
  DEFAULT_WHATSAPP_SETTINGS,
  isWhatsAppAvailable,
  normalizeWhatsAppPhone,
  validateWhatsAppSettings,
  whatsAppSettingsFromJson,
  whatsAppSettingsToJson,
} from './whatsapp-config';

describe('whatsapp-config (Phase 22)', () => {
  describe('normalizeWhatsAppPhone', () => {
    it('strips spaces, +, dashes and parentheses', () => {
      expect(normalizeWhatsAppPhone('+20 10 1234 5678')).toBe('201012345678');
      expect(normalizeWhatsAppPhone('+20 (10) 1234-5678')).toBe('201012345678');
    });

    it('returns an empty string for an empty input', () => {
      expect(normalizeWhatsAppPhone('')).toBe('');
      expect(normalizeWhatsAppPhone('   ')).toBe('');
    });

    it('accepts a valid international number', () => {
      expect(normalizeWhatsAppPhone('201012345678')).toBe('201012345678');
      expect(normalizeWhatsAppPhone('+971501234567')).toBe('971501234567');
    });

    it('rejects invalid numbers', () => {
      expect(() => normalizeWhatsAppPhone('123')).toThrow(ValidationError);
      expect(() => normalizeWhatsAppPhone('abc')).toThrow(ValidationError);
      expect(() => normalizeWhatsAppPhone('010')).toThrow(ValidationError);
    });
  });

  describe('validateWhatsAppSettings', () => {
    it('accepts disabled settings without a number', () => {
      expect(() => validateWhatsAppSettings({ ...DEFAULT_WHATSAPP_SETTINGS })).not.toThrow();
    });

    it('requires a valid number when enabled (fail closed)', () => {
      expect(() =>
        validateWhatsAppSettings({ ...DEFAULT_WHATSAPP_SETTINGS, enabled: true }),
      ).toThrow(ValidationError);
      expect(() =>
        validateWhatsAppSettings({ enabled: true, phoneNumber: 'abc', label: null }),
      ).toThrow(ValidationError);
    });

    it('accepts an enabled config with a valid number', () => {
      expect(() =>
        validateWhatsAppSettings({ enabled: true, phoneNumber: '201012345678', label: 'Chat' }),
      ).not.toThrow();
    });
  });

  describe('isWhatsAppAvailable', () => {
    it('is false when disabled or the number is invalid', () => {
      expect(isWhatsAppAvailable({ ...DEFAULT_WHATSAPP_SETTINGS })).toBe(false);
      expect(
        isWhatsAppAvailable({ enabled: true, phoneNumber: '123', label: null }),
      ).toBe(false);
    });

    it('is true when enabled with a valid number', () => {
      expect(isWhatsAppAvailable({ enabled: true, phoneNumber: '201012345678', label: null })).toBe(
        true,
      );
    });
  });

  describe('whatsAppSettingsFromJson', () => {
    it('defaults to disabled for missing/foreign rows (fail closed)', () => {
      expect(whatsAppSettingsFromJson(null)).toEqual(DEFAULT_WHATSAPP_SETTINGS);
      expect(whatsAppSettingsFromJson({})).toEqual(DEFAULT_WHATSAPP_SETTINGS);
    });

    it('reads the whatsapp key', () => {
      expect(
        whatsAppSettingsFromJson({ whatsapp: { enabled: true, phoneNumber: '201012345678' } }),
      ).toEqual({ enabled: true, phoneNumber: '201012345678', label: null });
    });
  });

  describe('whatsAppSettingsToJson', () => {
    it('serializes the whatsapp key without a label when null', () => {
      expect(
        whatsAppSettingsToJson({ enabled: true, phoneNumber: '201012345678', label: null }),
      ).toEqual({ whatsapp: { enabled: true, phoneNumber: '201012345678' } });
    });

    it('includes the label when present', () => {
      expect(
        whatsAppSettingsToJson({ enabled: true, phoneNumber: '201012345678', label: 'Chat' }),
      ).toEqual({ whatsapp: { enabled: true, phoneNumber: '201012345678', label: 'Chat' } });
    });
  });
});
