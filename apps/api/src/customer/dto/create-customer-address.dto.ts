import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * CustomerAddress creation input (docs/DATABASE.md §7.13 customer_addresses).
 *
 * The FINAL documents define NO CustomerAddress HTTP endpoints (API-SPEC §20
 * documents only the three Customer GET endpoints), so this DTO is the
 * service-level boundary validated by CustomerAddressesService — it will be
 * consumed by the future Checkout/Order phases.
 *
 * - required columns match the NOT NULL database contract exactly:
 *   first_name, last_name, city, address_line
 * - optional columns match the nullable database columns; nothing is
 *   invented (no address types, no country-specific rules, no normalization)
 * - `isDefault` is a documented boolean column (DEFAULT false); no
 *   default-address uniqueness rule is enforced (DATABASE.md §7.13 notes the
 *   partial unique index is an OPTIONAL technical decision, not adopted)
 * - string lengths follow the project's safe validation convention
 *   (MaxLength), mirroring the Catalog DTOs.
 */
export class CreateCustomerAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  lastName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  governorate?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  city!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  addressLine!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  building?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  apartment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  postalCode?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
