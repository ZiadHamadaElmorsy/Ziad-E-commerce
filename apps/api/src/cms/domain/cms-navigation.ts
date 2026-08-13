import { ValidationError } from '../../common/errors/domain-exceptions';

/**
 * Navigation item rules (docs/DATABASE.md §7.23/§21.2, docs/API-SPEC.md §27).
 *
 * DATABASE.md: "Navigation items may reference Pages, Categories, and
 * Storefront destinations (label + slug/id)". The documents define no schema
 * for the items JSONB beyond label + a slug/id reference. A type discriminator
 * is required to interpret the reference (PAGE/CATEGORY/DESTINATION); the
 * minimal shape implemented here is:
 *
 *   { "label": string, "type": "PAGE"|"CATEGORY"|"DESTINATION", "value": string }
 *
 * where `value` is the page/category id or the destination slug. The exact
 * item shape is reported as an OPEN DECISION in the Phase 12 report.
 *
 * Navigation is presentation configuration, not core commerce data
 * (DATABASE §21.2): items are validated for SHAPE only. Referential integrity
 * to pages/categories is not defined by the source documents.
 */
export const NAVIGATION_ITEM_TYPES = ['PAGE', 'CATEGORY', 'DESTINATION'] as const;

export type NavigationItemType = (typeof NAVIGATION_ITEM_TYPES)[number];

export function isNavigationItemType(type: string): type is NavigationItemType {
  return (NAVIGATION_ITEM_TYPES as readonly string[]).includes(type);
}

export interface NavigationItemRecord {
  label?: string;
  type?: string;
  value?: string;
}

/**
 * Domain-layer defense for navigation items. The class-validator DTO already
 * enforces the same rules; this runs again inside the service because items
 * are persisted as generic JSONB and must never carry malformed shapes.
 */
export function assertValidNavigationItems(items: unknown): void {
  if (!Array.isArray(items)) {
    throw new ValidationError('Navigation items must be an array.');
  }
  for (const item of items) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new ValidationError('Each navigation item must be an object.');
    }
    const record = item as NavigationItemRecord;
    if (typeof record.label !== 'string' || record.label.trim().length === 0) {
      throw new ValidationError('Each navigation item requires a non-empty label.');
    }
    if (typeof record.type !== 'string' || !isNavigationItemType(record.type)) {
      throw new ValidationError(
        'Each navigation item requires a type of PAGE, CATEGORY or DESTINATION.',
      );
    }
    if (typeof record.value !== 'string' || record.value.trim().length === 0) {
      throw new ValidationError(
        'Each navigation item requires a non-empty value (page/category id or destination slug).',
      );
    }
  }
}
