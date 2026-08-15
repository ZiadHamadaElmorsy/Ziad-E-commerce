import { ValidationError } from '../../common/errors/domain-exceptions';

/**
 * WhatsApp deep-link URL builder (Phase 22).
 *
 * Generates `https://wa.me/<digits>?text=<url-encoded message>` for the
 * merchant's configured E.164 number. The phone is validated before building;
 * the message is URL-encoded so Arabic text and line breaks survive.
 */

/** Safe regex for wa.me numbers: 1-3 digit country code + national number. */
const PHONE_PATTERN = /^[1-9][0-9]{8,14}$/;

/** Builds a wa.me deep link with an encoded text message. */
export function buildWhatsAppUrl(phoneNumber: string, message: string): string {
  if (!PHONE_PATTERN.test(phoneNumber)) {
    throw new ValidationError('The WhatsApp number is invalid.');
  }
  const base = phoneNumber.startsWith('0') ? phoneNumber : phoneNumber;
  return `https://wa.me/${base}?text=${encodeURIComponent(message)}`;
}

/** Builds a generic contact deep link (no order is created). */
export function buildWhatsAppContactUrl(phoneNumber: string, message: string): string {
  return buildWhatsAppUrl(phoneNumber, message);
}
