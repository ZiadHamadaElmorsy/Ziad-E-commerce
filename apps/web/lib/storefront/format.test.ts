import { describe, expect, it } from 'vitest';
import { formatMoney } from './format';

describe('storefront money formatting', () => {
  it('converts integer minor units (piastres) to the store currency', () => {
    expect(formatMoney(500, 'EGP')).toContain('5.00');
    expect(formatMoney(0, 'EGP')).toContain('0.00');
    expect(formatMoney(1000, 'EGP')).toContain('10.00');
  });

  it('is currency-aware', () => {
    expect(formatMoney(12345, 'USD')).toContain('123.45');
  });

  it('renders a dash for null/undefined', () => {
    expect(formatMoney(null, 'EGP')).toBe('—');
    expect(formatMoney(undefined, 'EGP')).toBe('—');
  });
});
