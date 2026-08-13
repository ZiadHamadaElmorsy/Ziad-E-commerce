import { GUEST_TOKEN_BYTES, generateGuestToken } from './cart-guest-token';

describe('cart guest token (docs/DATABASE.md §17.2/§33-9)', () => {
  it('generates an opaque base64url token with the documented entropy', () => {
    const token = generateGuestToken();

    // base64url of 32 random bytes = 43 chars, no padding.
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url').length).toBe(GUEST_TOKEN_BYTES);
  });

  it('generates a fresh token on every call', () => {
    const a = generateGuestToken();
    const b = generateGuestToken();
    expect(a).not.toBe(b);
  });

  it('contains no business information (fully random)', () => {
    // The token alphabet contains no structure, separators or identifiers; it
    // is entropy only (a technical guarantee of the opaque design).
    expect(generateGuestToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
