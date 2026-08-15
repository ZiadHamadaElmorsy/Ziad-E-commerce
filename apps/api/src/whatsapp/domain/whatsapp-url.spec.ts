import { ValidationError } from '../../common/errors/domain-exceptions';
import { buildWhatsAppUrl } from './whatsapp-url';

describe('buildWhatsAppUrl (Phase 22)', () => {
  it('builds a wa.me deep link with a URL-encoded message', () => {
    const url = buildWhatsAppUrl('201012345678', 'Hello, order ORD-1!');
    expect(url).toBe('https://wa.me/201012345678?text=Hello%2C%20order%20ORD-1!');
  });

  it('URL-encodes Arabic text and line breaks safely', () => {
    const url = buildWhatsAppUrl('201012345678', 'مرحبًا\nطلب');
    expect(url).toContain('https://wa.me/201012345678?text=');
    expect(decodeURIComponent(url)).toBe('https://wa.me/201012345678?text=مرحبًا\nطلب');
  });

  it('rejects invalid phone numbers (fail closed)', () => {
    expect(() => buildWhatsAppUrl('123', 'hi')).toThrow(ValidationError);
    expect(() => buildWhatsAppUrl('', 'hi')).toThrow(ValidationError);
  });
});
