import { MediaType } from '@prisma/client';

/**
 * Merchant Media representations (docs/API-SPEC.md §29, docs/DATABASE.md
 * §7.25/§22).
 *
 * This view is the PROTECTED merchant contract of the Media module. It exposes
 * the documented media metadata and the Supabase Storage object reference
 * (`storagePath`) — the reference returned to the client by the create/upload
 * flow ("The backend should return the required upload information/reference",
 * API-SPEC §29). Internal tenant columns (store_id, created_at) are never
 * rendered.
 *
 * `sizeBytes` is BIGINT in the database and is rendered as a JSON-safe number
 * (the same convention as money in the catalog/storefront views).
 */
export interface MediaView {
  id: string;
  mediaType: MediaType;
  mimeType: string | null;
  sizeBytes: number | null;
  altText: string | null;
  storagePath: string;
  createdAt: string;
}

export function toMediaView(media: {
  id: string;
  mediaType: MediaType;
  mimeType: string | null;
  sizeBytes: bigint | null;
  altText: string | null;
  storagePath: string;
  createdAt: Date;
}): MediaView {
  return {
    id: media.id,
    mediaType: media.mediaType,
    mimeType: media.mimeType,
    sizeBytes: media.sizeBytes === null ? null : Number(media.sizeBytes),
    altText: media.altText,
    storagePath: media.storagePath,
    createdAt: media.createdAt.toISOString(),
  };
}
