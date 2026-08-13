import { PageStatus } from '@prisma/client';
import { StateTransitionError } from '../../common/errors/domain-exceptions';
import { pageArchiveTarget, pagePatchStatusTarget } from './cms-status';

describe('cms-status (page lifecycle)', () => {
  describe('pagePatchStatusTarget', () => {
    it('publishes a DRAFT page (DRAFT -> PUBLISHED)', () => {
      expect(pagePatchStatusTarget(PageStatus.DRAFT, PageStatus.PUBLISHED)).toBe(
        PageStatus.PUBLISHED,
      );
    });

    it('unpublishes a PUBLISHED page (PUBLISHED -> DRAFT)', () => {
      expect(pagePatchStatusTarget(PageStatus.PUBLISHED, PageStatus.DRAFT)).toBe(PageStatus.DRAFT);
    });

    it('treats a same-status PATCH as an idempotent no-op', () => {
      expect(pagePatchStatusTarget(PageStatus.DRAFT, PageStatus.DRAFT)).toBeUndefined();
      expect(pagePatchStatusTarget(PageStatus.PUBLISHED, PageStatus.PUBLISHED)).toBeUndefined();
    });

    it('rejects ARCHIVED through PATCH (dedicated archive endpoint)', () => {
      expect(() => pagePatchStatusTarget(PageStatus.DRAFT, PageStatus.ARCHIVED)).toThrow(
        StateTransitionError,
      );
      expect(() => pagePatchStatusTarget(PageStatus.PUBLISHED, PageStatus.ARCHIVED)).toThrow(
        StateTransitionError,
      );
    });

    it('rejects any transition out of the terminal ARCHIVED state', () => {
      expect(() => pagePatchStatusTarget(PageStatus.ARCHIVED, PageStatus.DRAFT)).toThrow(
        StateTransitionError,
      );
      expect(() => pagePatchStatusTarget(PageStatus.ARCHIVED, PageStatus.PUBLISHED)).toThrow(
        StateTransitionError,
      );
    });
  });

  describe('pageArchiveTarget', () => {
    it('archives from DRAFT', () => {
      expect(pageArchiveTarget(PageStatus.DRAFT)).toBe(PageStatus.ARCHIVED);
    });

    it('archives from PUBLISHED', () => {
      expect(pageArchiveTarget(PageStatus.PUBLISHED)).toBe(PageStatus.ARCHIVED);
    });

    it('rejects archiving an already-archived page (terminal state)', () => {
      expect(() => pageArchiveTarget(PageStatus.ARCHIVED)).toThrow(StateTransitionError);
    });
  });
});
