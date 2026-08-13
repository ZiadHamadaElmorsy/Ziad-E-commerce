import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Maximum length for the optional `altText` upload parameter (implementation decision). */
export const MAX_ALT_TEXT_LENGTH = 1000;

/**
 * POST /api/v1/media query parameters (docs/API-SPEC.md §29).
 *
 * The upload body is the raw media binary; metadata is carried outside the
 * body: the Content-Type header (MIME type / media classification) and the
 * optional `altText` query parameter (the media.alt_text column —
 * docs/DATABASE.md §7.25).
 *
 * The API-SPEC does not define the upload request format; this is an
 * implementation decision (OPEN DECISION — see phase report).
 */
export class CreateMediaQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_ALT_TEXT_LENGTH)
  altText?: string;
}
