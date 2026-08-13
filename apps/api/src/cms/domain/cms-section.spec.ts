import { ValidationError } from '../../common/errors/domain-exceptions';
import {
  assertValidSectionContent,
  isSectionType,
  SECTION_TYPES,
  toDbSectionType,
} from './cms-section';

describe('cms-section (section types + content)', () => {
  it('exposes exactly the six documented section types', () => {
    expect(SECTION_TYPES).toEqual([
      'HERO',
      'BANNER',
      'FEATURED_PRODUCTS',
      'CATEGORY_GRID',
      'TEXT',
      'IMAGE',
    ]);
  });

  it('maps API types to the FINAL lowercase database section_type values', () => {
    expect(toDbSectionType('HERO')).toBe('hero');
    expect(toDbSectionType('BANNER')).toBe('banner');
    expect(toDbSectionType('FEATURED_PRODUCTS')).toBe('featured_products');
    expect(toDbSectionType('CATEGORY_GRID')).toBe('category_grid');
    expect(toDbSectionType('TEXT')).toBe('text');
    expect(toDbSectionType('IMAGE')).toBe('image');
  });

  it('recognizes only documented types', () => {
    expect(isSectionType('HERO')).toBe(true);
    expect(isSectionType('TEXT')).toBe(true);
    expect(isSectionType('hero')).toBe(false);
    expect(isSectionType('VIDEO')).toBe(false);
  });

  it('accepts a plain-object section content', () => {
    expect(() => assertValidSectionContent({ title: 'Hello' })).not.toThrow();
    expect(() => assertValidSectionContent({})).not.toThrow();
  });

  it.each([null, undefined, 'text', 42, [1, 2]])(
    'rejects non-object section content (%p)',
    (content) => {
      expect(() => assertValidSectionContent(content)).toThrow(ValidationError);
    },
  );
});
