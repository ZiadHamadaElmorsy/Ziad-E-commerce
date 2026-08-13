import { ValidationError } from '../../common/errors/domain-exceptions';
import { assertValidNavigationItems, isNavigationItemType } from './cms-navigation';

describe('cms-navigation (navigation items)', () => {
  it('recognizes the documented item types', () => {
    expect(isNavigationItemType('PAGE')).toBe(true);
    expect(isNavigationItemType('CATEGORY')).toBe(true);
    expect(isNavigationItemType('DESTINATION')).toBe(true);
    expect(isNavigationItemType('page')).toBe(false);
    expect(isNavigationItemType('PRODUCT')).toBe(false);
  });

  it('accepts valid navigation items (label + type + value)', () => {
    expect(() =>
      assertValidNavigationItems([
        { label: 'About', type: 'PAGE', value: 'page-1' },
        { label: 'T-Shirts', type: 'CATEGORY', value: 'category-1' },
        { label: 'Contact', type: 'DESTINATION', value: 'contact' },
      ]),
    ).not.toThrow();
  });

  it('accepts an empty items array (default navigation)', () => {
    expect(() => assertValidNavigationItems([])).not.toThrow();
  });

  it('rejects non-array items', () => {
    expect(() => assertValidNavigationItems({})).toThrow(ValidationError);
    expect(() => assertValidNavigationItems('items')).toThrow(ValidationError);
  });

  it('rejects malformed items (missing/invalid fields)', () => {
    expect(() => assertValidNavigationItems([{ type: 'PAGE', value: 'p' }])).toThrow(
      ValidationError,
    );
    expect(() => assertValidNavigationItems([{ label: 'X', type: 'PRODUCT', value: 'p' }])).toThrow(
      ValidationError,
    );
    expect(() => assertValidNavigationItems([{ label: 'X', type: 'PAGE' }])).toThrow(
      ValidationError,
    );
    expect(() => assertValidNavigationItems(['not-an-object'])).toThrow(ValidationError);
    expect(() => assertValidNavigationItems([null])).toThrow(ValidationError);
  });
});
