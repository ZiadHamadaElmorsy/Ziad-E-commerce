import { Readable } from 'node:stream';
import type { Request } from 'express';
import { readRawBody } from './read-raw-body';

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
    const result = await readRawBody(rawStreamRequest(chunks));
    expect(result.equals(Buffer.from('PNGDATA-tail'))).toBe(true);
  });

  it('returns an empty buffer for an empty stream (empty body)', async () => {
    const result = await readRawBody(rawStreamRequest([]));
    expect(result.length).toBe(0);
  });

  it('returns an existing Buffer body untouched (rawBody middleware)', async () => {
    const body = Buffer.from('already-read');
    const result = await readRawBody(parsedRequest(body));
    expect(result.equals(body)).toBe(true);
  });

  it('fails closed for a JSON-parsed body: returns an empty buffer (not a binary)', async () => {
    const result = await readRawBody(parsedRequest({ some: 'json' }));
    expect(result.length).toBe(0);
  });
});
