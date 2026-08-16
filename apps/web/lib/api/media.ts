import { api, apiUpload } from './client';
import { appConfig } from '@/lib/config';
import type { Envelope, MediaView } from './types';

/**
 * Media API — every call hits the real backend
 * (POST/GET/DELETE /api/v1/media, docs/API-SPEC.md §29).
 *
 * The backend exposes upload (raw binary), read (metadata), content (binary
 * stream for the merchant dashboard) and delete. There is NO list endpoint in
 * the API-SPEC, so the media UI does not fake one.
 */
export const mediaApi = {
  upload: (file: File, altText?: string) =>
    apiUpload<Envelope<MediaView>>(
      '/media',
      file,
      file.type || 'application/octet-stream',
      altText?.trim() ? { altText: altText.trim() } : {},
    ),

  getMedia: (mediaId: string) => api.get<Envelope<MediaView>>(`/media/${mediaId}`),

  deleteMedia: (mediaId: string) => api.delete<void>(`/media/${mediaId}`),
};

/**
 * Authenticated binary content URL for a media asset. The backend resolves the
 * media row store-scoped (Authorization header) and streams the bytes through
 * the server-side storage provider — the browser must attach the session
 * token, so use `DashboardMediaImage` (or a fetch with the token) rather than
 * a plain <img>.
 */
export function mediaContentUrl(mediaId: string): string {
  return `${appConfig.apiUrl}/media/${encodeURIComponent(mediaId)}/content`;
}

