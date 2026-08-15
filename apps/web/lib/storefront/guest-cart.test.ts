import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearGuestToken,
  getGuestToken,
  guestTokenKey,
  setGuestToken,
} from './guest-cart';

describe('guest cart token persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('stores and reads a token per store slug', () => {
    setGuestToken('my-store', 'token-a');
    setGuestToken('other-store', 'token-b');
    expect(getGuestToken('my-store')).toBe('token-a');
    expect(getGuestToken('other-store')).toBe('token-b');
  });

  it('uses a per-slug storage key (no cross-store leakage)', () => {
    expect(guestTokenKey('my-store')).toBe('ziad.guest.my-store');
    expect(guestTokenKey('other-store')).toBe('ziad.guest.other-store');
  });

  it('clears a token', () => {
    setGuestToken('my-store', 'token-a');
    clearGuestToken('my-store');
    expect(getGuestToken('my-store')).toBeUndefined();
  });

  it('returns undefined when no token exists', () => {
    expect(getGuestToken('my-store')).toBeUndefined();
  });
});
