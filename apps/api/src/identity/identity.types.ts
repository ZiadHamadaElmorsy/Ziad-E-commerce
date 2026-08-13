import { StoreStatus } from '@prisma/client';

/**
 * Public Store representation returned by the Store API.
 *
 * Intentionally excludes internal columns (created_at / updated_at) and
 * database implementation details. Only fields documented in the source
 * documents (docs/DATABASE.md §7.2) are exposed.
 */
export interface StoreView {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: StoreStatus;
  currency: string;
  timezone: string;
}
