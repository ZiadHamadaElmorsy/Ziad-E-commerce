import type { Request } from 'express';

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
 * NOTE: no maximum upload size is enforced here because no FINAL document
 * defines one (OPEN DECISION — see phase report).
 */
export async function readRawBody(request: Request): Promise<Buffer> {
  if (request.body !== undefined && request.body !== null) {
    if (Buffer.isBuffer(request.body)) {
      return request.body;
    }
    return Buffer.alloc(0);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}
