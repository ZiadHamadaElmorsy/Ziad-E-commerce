import { PageStatus } from '@prisma/client';
import { StateTransitionError } from '../../common/errors/domain-exceptions';

/**
 * Page lifecycle / state machine (docs/DOMAIN-MODEL.md §14.1,
 * docs/DATABASE.md §7.21/§12.1).
 *
 *   DRAFT <-> PUBLISHED   (via PATCH /pages/:id status — the API-SPEC defines
 *                          no dedicated publish/unpublish endpoint for pages,
 *                          only the archive endpoint; the DRAFT/PUBLISHED
 *                          states are therefore reached through the page
 *                          update endpoint)
 *   DRAFT | PUBLISHED -> ARCHIVED  (via POST /pages/:id/archive — API-SPEC §25)
 *
 * ARCHIVED is terminal: the FINAL lifecycle diagrams are forward-only and the
 * storefront exposes only PUBLISHED pages (DATABASE §29.6). PATCH never
 * accepts ARCHIVED (the dedicated archive endpoint owns that transition).
 *
 * Transition enforcement happens in two layers:
 *   1. these pure functions (service pre-check -> STATE_TRANSITION error)
 *   2. guarded conditional UPDATEs (WHERE status = current) inside the write
 *      transaction (docs/DATABASE.md §26.2 — concurrency-safe transitions)
 */
export function pageArchiveTarget(current: PageStatus): PageStatus {
  if (current === PageStatus.DRAFT || current === PageStatus.PUBLISHED) {
    return PageStatus.ARCHIVED;
  }
  throw new StateTransitionError(
    `A page can only be archived from DRAFT or PUBLISHED, not from ${current}.`,
  );
}

/**
 * Resolves the target status of a PATCH status update.
 *
 * - Setting the current status again is an idempotent no-op (returns
 *   undefined, so the caller simply leaves the status unchanged).
 * - DRAFT -> PUBLISHED publishes; PUBLISHED -> DRAFT unpublishes.
 * - ARCHIVED is rejected here (dedicated archive endpoint) and terminal
 *   ARCHIVED pages can never move backwards.
 */
export function pagePatchStatusTarget(
  current: PageStatus,
  requested: PageStatus,
): PageStatus | undefined {
  if (requested === current) {
    return undefined;
  }
  if (current === PageStatus.DRAFT && requested === PageStatus.PUBLISHED) {
    return PageStatus.PUBLISHED;
  }
  if (current === PageStatus.PUBLISHED && requested === PageStatus.DRAFT) {
    return PageStatus.DRAFT;
  }
  if (requested === PageStatus.ARCHIVED) {
    throw new StateTransitionError('Pages are archived through the dedicated archive endpoint.');
  }
  throw new StateTransitionError(`Page status cannot transition from ${current} to ${requested}.`);
}
