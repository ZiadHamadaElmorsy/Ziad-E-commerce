import { ValidationError } from '../../common/errors/domain-exceptions';

/**
 * Store-scoped WhatsApp ordering configuration (Phase 22).
 *
 * The configuration is stored inside the existing `store_settings.settings`
 * JSONB column under the key `whatsapp` — no new table, no new tenant model.
 * The shape is intentionally small:
 *
 *   {
 *     "whatsapp": {
 *       "enabled": boolean,
 *       "phoneNumber": "2010XXXXXXXX",   // E.164 digits, no "+" or separators
 *       "label": string | null           // optional display/help label
 *     }
 *   }
 *
 * - `phoneNumber` is normalized to E.164 digits (country code + national
 *   number) and validated client-side by the DTO and domain-side here.
 * - A missing/empty settings row defaults to `enabled: false` (fail closed).
 */

export interface WhatsAppSettings {
  enabled: boolean;
  /** E.164 digits, e.g. "201012345678". Empty string when unset. */
  phoneNumber: string;
  /** Optional display/help label shown next to the WhatsApp CTA. */
  label: string | null;
}

export const DEFAULT_WHATSAPP_SETTINGS: WhatsAppSettings = {
  enabled: false,
  phoneNumber: '',
  label: null,
};

/** Settings JSON key under which the WhatsApp configuration lives. */
export const WHATSAPP_SETTINGS_KEY = 'whatsapp';

/** Valid international phone: 1-3 digit country code + 7-13 digit national. */
const PHONE_PATTERN = /^[1-9][0-9]{8,14}$/;

/**
 * Normalizes a merchant-entered phone number to E.164 digits:
 * strips spaces, "+", parentheses and dashes. Returns the digit string, or an
 * empty string when the input is empty. Throws a ValidationError when the
 * normalized value is not a plausible international number (a merchant cannot
 * enable WhatsApp with a malformed number).
 */
export function normalizeWhatsAppPhone(value: string): string {
  const digits = value.replace(/[\s+\-()]/g, '');
  if (!digits) {
    return '';
  }
  if (!PHONE_PATTERN.test(digits)) {
    throw new ValidationError(
      'WhatsApp number must be a valid international number, e.g. +201012345678.',
    );
  }
  return digits;
}

/** Validates the full WhatsApp settings object (enabled requires a number). */
export function validateWhatsAppSettings(settings: WhatsAppSettings): void {
  if (!settings.enabled) {
    return;
  }
  if (!settings.phoneNumber || !PHONE_PATTERN.test(settings.phoneNumber)) {
    throw new ValidationError('A valid WhatsApp number is required to enable WhatsApp orders.');
  }
}

/** Whether the settings represent an actually usable WhatsApp configuration. */
export function isWhatsAppAvailable(settings: WhatsAppSettings): boolean {
  return settings.enabled && PHONE_PATTERN.test(settings.phoneNumber);
}

/**
 * Reads the `whatsapp` key from a raw `store_settings.settings` JSONB value,
 * tolerating missing/foreign rows (defaults to disabled — fail closed).
 */
export function whatsAppSettingsFromJson(raw: unknown): WhatsAppSettings {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_WHATSAPP_SETTINGS };
  }
  const record = raw as Record<string, unknown>;
  const whatsapp =
    record[WHATSAPP_SETTINGS_KEY] !== null && typeof record[WHATSAPP_SETTINGS_KEY] === 'object'
      ? (record[WHATSAPP_SETTINGS_KEY] as Record<string, unknown>)
      : {};
  return {
    enabled: whatsapp.enabled === true,
    phoneNumber: typeof whatsapp.phoneNumber === 'string' ? whatsapp.phoneNumber : '',
    label: typeof whatsapp.label === 'string' && whatsapp.label.length > 0 ? whatsapp.label : null,
  };
}

/** Serializes WhatsApp settings into the `store_settings.settings` JSONB. */
export function whatsAppSettingsToJson(settings: WhatsAppSettings): Record<string, unknown> {
  return {
    [WHATSAPP_SETTINGS_KEY]: {
      enabled: settings.enabled,
      phoneNumber: settings.phoneNumber,
      ...(settings.label ? { label: settings.label } : {}),
    },
  };
}
