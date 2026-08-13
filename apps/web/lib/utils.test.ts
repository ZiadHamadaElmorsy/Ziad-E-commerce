import { describe, expect, it } from 'vitest';
import { cn, formatEgpHtml, initialsFrom, isEmail, titleCase } from './utils';

describe('utils', () => {
  it('cn joins truthy class names', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
  });

  it('formatEgpHtml converts piastres to EGP currency', () => {
    expect(formatEgpHtml(500)).toContain('5.00');
    expect(formatEgpHtml(0)).toContain('0.00');
    expect(formatEgpHtml(null)).toBe('—');
    expect(formatEgpHtml(undefined)).toBe('—');
  });

  it('initialsFrom builds avatar initials from a name', () => {
    expect(initialsFrom('Ziad Hamada')).toBe('ZH');
    expect(initialsFrom(undefined, 'merchant@ziad.test')).toBe('ME');
  });

  it('isEmail validates email addresses', () => {
    expect(isEmail('merchant@ziad.test')).toBe(true);
    expect(isEmail('not-an-email')).toBe(false);
    expect(isEmail('')).toBe(false);
  });

  it('titleCase converts enum-style values to title case', () => {
    expect(titleCase('DRAFT')).toBe('Draft');
    expect(titleCase('COMPARE_AT_PRICE')).toBe('Compare At Price');
  });
});
