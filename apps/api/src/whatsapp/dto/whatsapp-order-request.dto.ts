import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
import {
  CheckoutCustomerDto,
  CheckoutShippingAddressDto,
} from '../../checkout/dto/checkout-request.dto';

/**
 * POST /api/v1/storefront/orders/whatsapp request body (Phase 22):
 *
 *   {
 *     "customer": { "name": "...", "phone": "...", "email": "..." },
 *     "shippingAddress": { "governorate": "...", "city": "...", "addressLine": "..." },
 *     "orderId": "optional-existing-order-uuid",
 *     "lang": "en" | "ar"
 *   }
 *
 * - `customer` + `shippingAddress` reuse the exact checkout contract; the
 *   server revalidates the cart/price/inventory through the existing checkout
 *   pipeline (client prices/totals are never trusted).
 * - `orderId` (optional) reuses an order created earlier in the same checkout
 *   session instead of creating a duplicate (the online-payment failure
 *   fallback). The order is store-scoped and verified on the server.
 * - `lang` selects the WhatsApp message language (default en).
 */
export class WhatsAppOrderRequestDto {
  @ValidateNested()
  @Type(() => CheckoutCustomerDto)
  customer!: CheckoutCustomerDto;

  @ValidateNested()
  @Type(() => CheckoutShippingAddressDto)
  shippingAddress!: CheckoutShippingAddressDto;

  @IsOptional()
  @IsString()
  orderId?: string;

  @IsOptional()
  @IsIn(['en', 'ar'])
  lang?: 'en' | 'ar';
}
