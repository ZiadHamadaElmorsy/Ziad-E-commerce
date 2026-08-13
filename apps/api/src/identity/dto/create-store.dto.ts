import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

/**
 * POST /api/v1/stores request body (docs/API-SPEC.md, section 15
 * "Create Store").
 *
 * The API-SPEC request is exactly:
 *
 *   { "name": "My Store", "slug": "my-store", "currency": "EGP" }
 *
 * - `name`     required
 * - `slug`     required (charset/length validated in the domain layer)
 * - `currency` optional, ISO 4217 3-letter code; defaults to EGP
 *   (MVP-SCOPE / BRD / USER-STORIES: "Currency defaults to EGP").
 *
 * `description` and `timezone` are intentionally NOT part of this DTO: the
 * API-SPEC request does not include them, and the finalized DB defaults
 * (`timezone = 'Africa/Cairo'`, `description = NULL`) apply.
 */
export class CreateStoreDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  slug!: string;

  /** ISO 4217 currency code (char(3)); defaults to EGP. */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/, {
    message: 'currency must be a 3-letter ISO 4217 code (e.g. EGP).',
  })
  currency?: string;
}
