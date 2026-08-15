import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class WhatsAppSettingsInputDto {
  @IsBoolean()
  enabled!: boolean;

  @IsString()
  phoneNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}

/**
 * PUT /api/v1/stores/current/settings/whatsapp request body (Phase 22).
 *
 *   {
 *     "whatsapp": {
 *       "enabled": true,
 *       "phoneNumber": "+201012345678",
 *       "label": "Chat with us"
 *     }
 *   }
 *
 * - `phoneNumber` accepts any common international formatting; the service
 *   normalizes it to E.164 digits and rejects invalid numbers.
 * - `label` is an optional short display/help label.
 * - No storeId is accepted: the tenant comes from the trusted context.
 */
export class UpdateWhatsAppSettingsDto {
  @ValidateNested()
  @Type(() => WhatsAppSettingsInputDto)
  whatsapp!: WhatsAppSettingsInputDto;
}
