import { IsNotEmpty, IsString } from 'class-validator';

/**
 * PATCH /api/v1/stores/current request body (docs/API-SPEC.md, section 15
 * "Update Store").
 *
 * The API-SPEC lists these possible fields:
 *
 *   { "name": "Updated Store", "logoMediaId": "...",
 *     "contactEmail": "...", "contactPhone": "..." }
 *
 * Only `name` maps to a column on the FINAL `stores` table
 * (docs/DATABASE.md §7.2). The remaining three fields have NO FINAL database
 * home:
 *
 *   - `logoMediaId`   -> Store logo is a Media reference on
 *                       `theme_configurations` (DATABASE.md §7.2 note) — a
 *                       CMS/Media concern of a later phase.
 *   - `contactEmail` / `contactPhone` -> no column or table in the FINAL
 *                       DATABASE.md schema.
 *
 * They are therefore NOT accepted here: the global ValidationPipe rejects
 * unknown properties (`forbidNonWhitelisted`) with 400 VALIDATION_ERROR. This
 * is reported as an API-SPEC (Draft) vs DATABASE (FINAL) contradiction that
 * requires a Product Owner decision — see
 * docs/IMPLEMENTATION-PHASE2-IDENTITY-TENANCY.md.
 *
 * Store `slug` and `status` are NOT in the API-SPEC PATCH field list and are
 * intentionally not mutable through this endpoint.
 */
export class UpdateStoreDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}
