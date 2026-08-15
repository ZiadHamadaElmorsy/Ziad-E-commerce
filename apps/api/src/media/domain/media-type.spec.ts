import { MediaType } from '@prisma/client';
import {
  DEFAULT_ALLOWED_IMAGE_MIME_TYPES,
  deriveMediaType,
  isAllowedMediaMime,
  isUsableMimeType,
  normalizeMimeType,
  sniffImageMimeType,
} from './media-type';

/** Minimal valid PNG bytes (magic + padding) for content/type consistency. */
function pngBytes(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00]);
}

function jpegBytes(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
}

function webpBytes(): Buffer {
  return Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ]);
}

function gifBytes(): Buffer {
  return Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
}

function avifBytes(): Buffer {
  return Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]);
}

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

  it('maps every other Content-Type to FILE', () => {
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

  describe('isAllowedMediaMime (Phase 21 allowlist)', () => {
    it('accepts the default image MIME types', () => {
      for (const mime of DEFAULT_ALLOWED_IMAGE_MIME_TYPES) {
        expect(isAllowedMediaMime(mime, DEFAULT_ALLOWED_IMAGE_MIME_TYPES)).toBe(true);
      }
    });

    it('rejects MIME types outside the allowlist', () => {
      expect(isAllowedMediaMime('video/mp4', DEFAULT_ALLOWED_IMAGE_MIME_TYPES)).toBe(false);
      expect(isAllowedMediaMime('application/pdf', DEFAULT_ALLOWED_IMAGE_MIME_TYPES)).toBe(false);
      expect(isAllowedMediaMime('image/svg+xml', DEFAULT_ALLOWED_IMAGE_MIME_TYPES)).toBe(false);
      expect(isAllowedMediaMime('text/html', DEFAULT_ALLOWED_IMAGE_MIME_TYPES)).toBe(false);
    });

    it('respects a custom allowlist', () => {
      expect(isAllowedMediaMime('image/png', ['image/png'])).toBe(true);
      expect(isAllowedMediaMime('image/jpeg', ['image/png'])).toBe(false);
    });
  });

  describe('sniffImageMimeType (magic bytes, Phase 21)', () => {
    it('recognizes PNG, JPEG, WEBP, GIF and AVIF signatures', () => {
      expect(sniffImageMimeType(pngBytes())).toBe('image/png');
      expect(sniffImageMimeType(jpegBytes())).toBe('image/jpeg');
      expect(sniffImageMimeType(webpBytes())).toBe('image/webp');
      expect(sniffImageMimeType(gifBytes())).toBe('image/gif');
      expect(sniffImageMimeType(avifBytes())).toBe('image/avif');
    });

    it('fails closed for non-image content and short buffers', () => {
      expect(sniffImageMimeType(Buffer.from('plain text'))).toBeNull();
      expect(sniffImageMimeType(Buffer.alloc(4))).toBeNull();
      expect(sniffImageMimeType(Buffer.alloc(0))).toBeNull();
    });

    it('rejects a RIFF container that is not WEBP', () => {
      expect(sniffImageMimeType(Buffer.alloc(12).fill(0x52))).toBeNull();
    });
  });
});
