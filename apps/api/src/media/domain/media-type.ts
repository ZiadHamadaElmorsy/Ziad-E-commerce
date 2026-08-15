import { MediaType } from '@prisma/client';

/**
 * Media type classification (docs/DATABASE.md §7.25/§12.2).
 *
 * The `media_type` enum is exactly IMAGE / VIDEO / FILE ("technical"). It is
 * derived from the uploaded file's MIME/Content-Type: `image/*` -> IMAGE,
 * `video/*` -> VIDEO, everything else -> FILE.
 *
 * Phase 21 — upload security: the generic upload endpoint now enforces a
 * strict MIME allowlist (MEDIA_ALLOWED_MIME_TYPES) plus magic-byte
 * verification, so `deriveMediaType` is only ever reached for an allowed
 * MIME. Unsupported types are rejected with VALIDATION_ERROR instead of
 * being stored as FILE.
 */

/** Default allowed upload MIME types (configurable via MEDIA_ALLOWED_MIME_TYPES). */
export const DEFAULT_ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
];

export function deriveMediaType(mimeType: string): MediaType {
  if (mimeType.startsWith('image/')) {
    return MediaType.IMAGE;
  }
  if (mimeType.startsWith('video/')) {
    return MediaType.VIDEO;
  }
  return MediaType.FILE;
}

/**
 * Normalizes a raw Content-Type header value: lowercases and strips any
 * parameters (e.g. `image/png; charset=binary` -> `image/png`).
 */
export function normalizeMimeType(contentType: string): string {
  const [mime] = contentType.split(';');
  return mime.trim().toLowerCase();
}

/**
 * True when a Content-Type is present and non-empty. The media_type column is
 * NOT NULL, so an upload without a classifiable Content-Type cannot create a
 * media record and fails validation (fails closed).
 */
export function isUsableMimeType(contentType: string | undefined): contentType is string {
  return typeof contentType === 'string' && contentType.trim().length > 0;
}

/** True when the MIME type is in the configured allowlist. */
export function isAllowedMediaMime(
  mimeType: string,
  allowedMimeTypes: readonly string[],
): boolean {
  return allowedMimeTypes.includes(normalizeMimeType(mimeType));
}

/**
 * Verifies that the binary content matches its declared MIME type via magic
 * bytes (JPEG / PNG / GIF / WEBP / AVIF). Returns the normalized MIME type
 * when the content is consistent, or null otherwise. Files with no recognized
 * signature fail closed (never trusted by Content-Type alone).
 */
export function sniffImageMimeType(data: Buffer): string | null {
  if (data.length < 12) {
    return null;
  }

  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47 &&
    data[4] === 0x0d &&
    data[5] === 0x0a &&
    data[6] === 0x1a &&
    data[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    data[0] === 0x47 &&
    data[1] === 0x49 &&
    data[2] === 0x46 &&
    data[3] === 0x38
  ) {
    return 'image/gif';
  }
  if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46) {
    // RIFF....WEBP
    if (data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) {
      return 'image/webp';
    }
    return null;
  }
  // ISO BMFF container used by AVIF (ftyp at bytes 4..8 with an avif/avis brand).
  if (
    data[4] === 0x66 &&
    data[5] === 0x74 &&
    data[6] === 0x79 &&
    data[7] === 0x70
  ) {
    const brand = data.slice(8, 12).toString('ascii');
    if (brand === 'avif' || brand === 'avis') {
      return 'image/avif';
    }
    return null;
  }

  return null;
}

