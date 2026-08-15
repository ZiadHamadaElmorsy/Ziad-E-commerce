import { describe, expect, it } from 'vitest';
import { merchantHomePath } from './merchant-route';

describe('merchantHomePath (single routing source of truth)', () => {
  it('routes a merchant with a store to the dashboard', () => {
    expect(merchantHomePath({ id: 'store-1' })).toBe('/dashboard');
  });

  it('routes a merchant without a store to onboarding', () => {
    expect(merchantHomePath(null)).toBe('/onboarding');
  });
});
