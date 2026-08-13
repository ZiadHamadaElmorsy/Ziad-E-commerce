import { CategoryStatus, ProductStatus, VariantStatus } from '@prisma/client';
import { StateTransitionError } from '../../common/errors/domain-exceptions';

/**
 * Catalog lifecycle/state machines (docs/DOMAIN-MODEL.md §7, docs/DATABASE.md
 * §12.2, docs/API-SPEC.md §16-18).
 *
 * Product:
 *
 *   DRAFT -> ACTIVE -> ARCHIVED
 *
 *   - publish   : DRAFT -> ACTIVE        (POST /products/:id/publish)
 *   - unpublish : ACTIVE -> DRAFT        (POST /products/:id/unpublish)
 *   - archive   : DRAFT/ACTIVE -> ARCHIVED (POST /products/:id/archive)
 *
 * Variant:
 *
 *   ACTIVE -> ARCHIVED  (POST /variants/:id/archive) — ARCHIVED is terminal.
 *
 * Category:
 *
 *   ACTIVE -> ARCHIVED  (POST /categories/:id/archive) — ARCHIVED is terminal.
 *
 * ARCHIVED is treated as terminal for all three entities: the FINAL lifecycle
 * diagrams are forward-only and contain no reverse arrow. Allowing
 * DRAFT -> ARCHIVED for products is an interpretation (reported as an OPEN
 * DECISION) that follows MVP-SCOPE/USER-STORIES: a merchant "archives" any
 * product they want to remove from active catalog management.
 *
 * Transition enforcement happens in two layers:
 *   1. these pure functions (service pre-check -> STATE_TRANSITION error)
 *   2. guarded conditional UPDATEs (WHERE status = current) inside the write
 *      transaction (docs/DATABASE.md §26.2 — concurrency-safe transitions)
 */
export function productPublishTarget(current: ProductStatus): ProductStatus {
  if (current === ProductStatus.DRAFT) {
    return ProductStatus.ACTIVE;
  }
  throw new StateTransitionError(
    `A product can only be published from DRAFT, not from ${current}.`,
  );
}

export function productUnpublishTarget(current: ProductStatus): ProductStatus {
  if (current === ProductStatus.ACTIVE) {
    return ProductStatus.DRAFT;
  }
  throw new StateTransitionError(
    `A product can only be unpublished from ACTIVE, not from ${current}.`,
  );
}

export function productArchiveTarget(current: ProductStatus): ProductStatus {
  if (current === ProductStatus.DRAFT || current === ProductStatus.ACTIVE) {
    return ProductStatus.ARCHIVED;
  }
  throw new StateTransitionError(
    `A product can only be archived from DRAFT or ACTIVE, not from ${current}.`,
  );
}

export function variantArchiveTarget(current: VariantStatus): VariantStatus {
  if (current === VariantStatus.ACTIVE) {
    return VariantStatus.ARCHIVED;
  }
  throw new StateTransitionError(
    `A variant can only be archived from ACTIVE, not from ${current}.`,
  );
}

export function categoryArchiveTarget(current: CategoryStatus): CategoryStatus {
  if (current === CategoryStatus.ACTIVE) {
    return CategoryStatus.ARCHIVED;
  }
  throw new StateTransitionError(
    `A category can only be archived from ACTIVE, not from ${current}.`,
  );
}
