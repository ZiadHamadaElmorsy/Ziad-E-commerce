import { Readable } from 'node:stream';
import type { Request } from 'express';
import { readRawBody, UploadTooLargeError } from './read-raw-body';

/** Builds a minimal express-like request whose body stream yields `chunks`. */
function rawStreamRequest(chunks: Buffer[]): Request {
  return Readable.from(chunks) as unknown as Request;
}

/** Builds a request that a body parser already consumed (`req.body` set). */
function parsedRequest(body: unknown): Request {
  const request = Readable.from([]) as unknown as { body?: unknown } & Request;
  request.body = body;
  return request as Request;
}

describe('readRawBody (POST /api/v1/media direct upload)', () => {
  it('reads a raw binary stream into a Buffer', async () => {
    const chunks = [Buffer.from('PNGDATA'), Buffer.from('-tail')];
    const result = await readRawBody(rawStreamRequest(chunks), 1024);
    expect(result.equals(Buffer.from('PNGDATA-tail'))).toBe(true);
  });

  it('returns an empty buffer for an empty stream (empty body)', async () => {
    const result = await readRawBody(rawStreamRequest([]), 1024);
    expect(result.length).toBe(0);
  });

  it('returns an existing Buffer body untouched (rawBody middleware)', async () => {
    const body = Buffer.from('already-read');
    const result = await readRawBody(parsedRequest(body), 1024);
    expect(result.equals(body)).toBe(true);
  });

  it('fails closed for a JSON-parsed body: returns an empty buffer (not a binary)', async () => {
    const result = await readRawBody(parsedRequest({ some: 'json' }), 1024);
    expect(result.length).toBe(0);
  });

  it('rejects a stream larger than the maximum allowed size (Phase 21)', async () => {
    const chunks = [Buffer.alloc(600), Buffer.alloc(600)];
    await expect(readRawBody(rawStreamRequest(chunks), 1024)).rejects.toBeInstanceOf(
      UploadTooLargeError,
    );
  });

  it('rejects an already-buffered body larger than the maximum allowed size', async () => {
    await expect(readRawBody(parsedRequest(Buffer.alloc(2048)), 1024)).rejects.toBeInstanceOf(
      UploadTooLargeError,
    );
  });

  it('accepts a stream exactly at the maximum allowed size', async () => {
    const body = Buffer.alloc(1024);
    const result = await readRawBody(rawStreamRequest([body]), 1024);
    expect(result.length).toBe(1024);
  });
});
