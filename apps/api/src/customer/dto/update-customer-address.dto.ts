import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * CustomerAddress update input — every field optional (PATCH semantics).
 *
 * Same field contract as CreateCustomerAddressDto (docs/DATABASE.md §7.13).
 * `customerId`/`storeId` are NEVER accepted from client input: the owning
 * customer comes from the route and the store from the trusted tenant context.
 */
export class UpdateCustomerAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  firstName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  lastName?: string;

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

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  city?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  addressLine?: string;

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
