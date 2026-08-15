import { afterEach, describe, expect, it } from 'vitest';
import { clearOrderLookupToken, getOrderLookupToken, saveOrderLookupToken } from './order-token';

describe('order-token (Phase 23)', () => {
  afterEach(() => {
    window.sessionStorage.clear();
  });

  it('saves and retrieves a token per order id', () => {
    saveOrderLookupToken('order-1', 'token-abc');
    expect(getOrderLookupToken('order-1')).toBe('token-abc');
  });

  it('does not leak a token across order ids', () => {
    saveOrderLookupToken('order-1', 'token-abc');
    expect(getOrderLookupToken('order-2')).toBeNull();
  });

  it('ignores a null/empty token', () => {
    saveOrderLookupToken('order-1', null);
    expect(getOrderLookupToken('order-1')).toBeNull();
  });

  it('clears the token', () => {
    saveOrderLookupToken('order-1', 'token-abc');
    clearOrderLookupToken('order-1');
    expect(getOrderLookupToken('order-1')).toBeNull();
  });
});
