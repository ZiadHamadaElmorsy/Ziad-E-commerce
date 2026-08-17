import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Optional body of POST /api/v1/products/:productId/media/:mediaId — attaches
 * an existing media asset to a product (extending the Phase 13 contract).
 *
 *   { "variantId": "...", "isPrimary": true, "altText": "Black front" }
 *
 * - `variantId` (optional): associate the image with a specific variant of
 *   the SAME product+store (validated by the service).
 * - `isPrimary` (optional): mark the image as the product cover.
 * - `altText` (optional): per-association alt text (overrides the media row).
 */
export class AttachProductMediaDto {
  @IsOptional()
  @IsUUID()
  variantId?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  altText?: string;
}

/**
 * PATCH /api/v1/products/:productId/media/:mediaId — update ONE association:
 * position, primary flag, variant link, alt text.
 *
 *   { "sortOrder": 0, "isPrimary": true }
 */
export class UpdateProductMediaDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsUUID()
  variantId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  altText?: string | null;
}

/**
 * PUT /api/v1/products/:productId/media/order — batch reorder (drag & drop).
 * The list MUST be a permutation of the product's currently-attached media
 * ids; positions are assigned 0..n-1 in a single tenant-bound transaction.
 *
 *   { "order": ["mediaId3", "mediaId1", "mediaId2"] }
 */
export class ReorderProductMediaDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  order!: string[];
}

/** GET /api/v1/products/:productId/media — paginated gallery metadata. */
export class ListProductMediaQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 24;

  @IsOptional()
  @IsUUID()
  variantId?: string;
}
