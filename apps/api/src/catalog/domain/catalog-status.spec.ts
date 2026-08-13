import { CategoryStatus, ProductStatus, VariantStatus } from '@prisma/client';
import { StateTransitionError } from '../../common/errors/domain-exceptions';
import {
  categoryArchiveTarget,
  productArchiveTarget,
  productPublishTarget,
  productUnpublishTarget,
  variantArchiveTarget,
} from './catalog-status';

describe('catalog lifecycle state machines (docs/DOMAIN-MODEL.md §7)', () => {
  describe('product: DRAFT -> ACTIVE -> ARCHIVED', () => {
    it('publish is only allowed from DRAFT', () => {
      expect(productPublishTarget(ProductStatus.DRAFT)).toBe(ProductStatus.ACTIVE);
      expect(() => productPublishTarget(ProductStatus.ACTIVE)).toThrow(StateTransitionError);
      expect(() => productPublishTarget(ProductStatus.ARCHIVED)).toThrow(StateTransitionError);
    });

    it('unpublish is only allowed from ACTIVE', () => {
      expect(productUnpublishTarget(ProductStatus.ACTIVE)).toBe(ProductStatus.DRAFT);
      expect(() => productUnpublishTarget(ProductStatus.DRAFT)).toThrow(StateTransitionError);
      expect(() => productUnpublishTarget(ProductStatus.ARCHIVED)).toThrow(StateTransitionError);
    });

    it('archive is allowed from DRAFT or ACTIVE and ARCHIVED is terminal', () => {
      expect(productArchiveTarget(ProductStatus.DRAFT)).toBe(ProductStatus.ARCHIVED);
      expect(productArchiveTarget(ProductStatus.ACTIVE)).toBe(ProductStatus.ARCHIVED);
      expect(() => productArchiveTarget(ProductStatus.ARCHIVED)).toThrow(StateTransitionError);
    });
  });

  describe('variant: ACTIVE -> ARCHIVED (terminal)', () => {
    it('archive is only allowed from ACTIVE', () => {
      expect(variantArchiveTarget(VariantStatus.ACTIVE)).toBe(VariantStatus.ARCHIVED);
      expect(() => variantArchiveTarget(VariantStatus.ARCHIVED)).toThrow(StateTransitionError);
    });
  });

  describe('category: ACTIVE -> ARCHIVED (terminal)', () => {
    it('archive is only allowed from ACTIVE', () => {
      expect(categoryArchiveTarget(CategoryStatus.ACTIVE)).toBe(CategoryStatus.ARCHIVED);
      expect(() => categoryArchiveTarget(CategoryStatus.ARCHIVED)).toThrow(StateTransitionError);
    });
  });
});
