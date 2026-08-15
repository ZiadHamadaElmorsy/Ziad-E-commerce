import { describe, expect, it } from 'vitest';
import { whatsappContactUrl } from './types';

describe('whatsappContactUrl (Phase 22)', () => {
  it('builds a wa.me deep link with a URL-encoded generic message', () => {
    const url = whatsappContactUrl('201012345678', 'Hello, I need help.');
    expect(url).toBe('https://wa.me/201012345678?text=Hello%2C%20I%20need%20help.');
  });

  it('strips formatting characters from the phone number', () => {
    const url = whatsappContactUrl('+20 10 1234 5678', 'Hi');
    expect(url.startsWith('https://wa.me/201012345678?text=')).toBe(true);
  });

  it('URL-encodes Arabic text safely', () => {
    const url = whatsappContactUrl('201012345678', 'مرحبًا');
    expect(decodeURIComponent(url)).toBe('https://wa.me/201012345678?text=مرحبًا');
  });
});
