import { MediaType } from '@prisma/client';
import { deriveMediaType, isUsableMimeType, normalizeMimeType } from './media-type';

describe('media-type classification (docs/DATABASE.md §7.25/§12.2)', () => {
  it('maps image/* Content-Types to IMAGE', () => {
    expect(deriveMediaType('image/png')).toBe(MediaType.IMAGE);
    expect(deriveMediaType('image/jpeg')).toBe(MediaType.IMAGE);
    expect(deriveMediaType('image/svg+xml')).toBe(MediaType.IMAGE);
    expect(deriveMediaType('image/webp')).toBe(MediaType.IMAGE);
  });

  it('maps video/* Content-Types to VIDEO', () => {
    expect(deriveMediaType('video/mp4')).toBe(MediaType.VIDEO);
    expect(deriveMediaType('video/webm')).toBe(MediaType.VIDEO);
  });

  it('maps every other Content-Type to FILE (no MIME allowlist invented)', () => {
    expect(deriveMediaType('application/pdf')).toBe(MediaType.FILE);
    expect(deriveMediaType('text/plain')).toBe(MediaType.FILE);
    expect(deriveMediaType('application/octet-stream')).toBe(MediaType.FILE);
  });

  it('normalizeMimeType lowercases and strips parameters', () => {
    expect(normalizeMimeType('image/Png; charset=binary')).toBe('image/png');
    expect(normalizeMimeType('  image/png  ')).toBe('image/png');
    expect(normalizeMimeType('IMAGE/PNG')).toBe('image/png');
  });

  it('isUsableMimeType fails closed for missing/blank Content-Types', () => {
    expect(isUsableMimeType(undefined)).toBe(false);
    expect(isUsableMimeType('')).toBe(false);
    expect(isUsableMimeType('   ')).toBe(false);
    expect(isUsableMimeType('image/png')).toBe(true);
  });
});
