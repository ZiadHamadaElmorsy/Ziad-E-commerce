import { Type } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';

/**
 * POST /api/v1/checkout request body (docs/API-SPEC.md §22 "Create Checkout",
 * docs/MVP-SCOPE.md §15, docs/BRD.md §15):
 *
 *   {
 *     "customer": {
 *       "name": "Ahmed Ali",
 *       "phone": "01000000000",
 *       "email": "ahmed@example.com"
 *     },
 *     "shippingAddress": {
 *       "governorate": "Gharbia",
 *       "city": "Tanta",
 *       "addressLine": "..."
 *     }
 *   }
 *
 * - `customer.name` and `customer.phone` are required (US-CHECK-001: the
 *   customer provides Name, Phone, Email where applicable). `email` is
 *   optional but must be a valid email when present.
 * - `shippingAddress` requires governorate/city/addressLine; `building` and
 *   `apartment` are the PRD/MVP-SCOPE "additional address details" and are
 *   optional.
 * - No storeId/customerId/cartId/price/total fields are accepted: tenant, cart
 *   and pricing are resolved server-side from the trusted context, and the
 *   global ValidationPipe (forbidNonWhitelisted) rejects any undocumented
 *   field. Client-provided totals are never authoritative (API-SPEC §22).
 */
export class CheckoutCustomerDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class CheckoutShippingAddressDto {
  @IsString()
  @IsNotEmpty()
  governorate!: string;

  @IsString()
  @IsNotEmpty()
  city!: string;

  @IsString()
  @IsNotEmpty()
  addressLine!: string;

  @IsOptional()
  @IsString()
  building?: string;

  @IsOptional()
  @IsString()
  apartment?: string;
}

export class CheckoutRequestDto {
  @ValidateNested()
  @Type(() => CheckoutCustomerDto)
  customer!: CheckoutCustomerDto;

  @ValidateNested()
  @Type(() => CheckoutShippingAddressDto)
  shippingAddress!: CheckoutShippingAddressDto;
}
