import { MediaType } from '@prisma/client';

/**
 * Media type classification (docs/DATABASE.md §7.25/§12.2).
 *
 * The `media_type` enum is exactly IMAGE / VIDEO / FILE ("technical"). It is
 * derived from the uploaded file's MIME/Content-Type: `image/*` -> IMAGE,
 * `video/*` -> VIDEO, everything else -> FILE.
 *
 * No MIME allowlist or extension restriction is enforced: no FINAL document
 * defines one, so none is invented here (OPEN DECISION — see phase report).
 */
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
