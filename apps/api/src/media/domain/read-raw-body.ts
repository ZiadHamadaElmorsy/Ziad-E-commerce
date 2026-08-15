import type { Request } from 'express';

/**
 * Error thrown when an upload exceeds the configured maximum size (Phase 21).
 */
export class UploadTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`The media upload exceeds the maximum allowed size of ${maxBytes} bytes.`);
    this.name = 'UploadTooLargeError';
  }
}

/**
 * Reads the raw request body as a Buffer for the direct server upload
 * (POST /api/v1/media — docs/API-SPEC.md §29 "Create Media Upload").
 *
 * The global JSON body parser (express.json) only consumes
 * `application/json` payloads, so a media binary reaches this helper
 * unparsed through the request stream. When a body parser already consumed
 * the request (e.g. a client sent `Content-Type: application/json`), the
 * payload is NOT a raw binary and an empty buffer is returned so the upload
 * fails validation instead of accepting a non-binary body.
 *
 * Phase 21 — the stream is read with a hard cap (`maxBytes`): a payload that
 * exceeds the limit is rejected as soon as the cap is crossed instead of
 * buffering an unbounded body into memory (MEDIA_MAX_UPLOAD_BYTES).
 */
export async function readRawBody(
  request: Request,
  maxBytes: number,
): Promise<Buffer> {
  if (request.body !== undefined && request.body !== null) {
    if (Buffer.isBuffer(request.body)) {
      if (request.body.length > maxBytes) {
        throw new UploadTooLargeError(maxBytes);
      }
      return request.body;
    }
    return Buffer.alloc(0);
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    total += buffer.length;
    if (total > maxBytes) {
      throw new UploadTooLargeError(maxBytes);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}
