import { api, apiUpload } from './client';
import type { Envelope, MediaView } from './types';

/**
 * Media API — every call hits the real backend
 * (POST/GET/DELETE /api/v1/media, docs/API-SPEC.md §29).
 *
 * The backend exposes upload (raw binary), read (metadata), and delete. There
 * is NO list endpoint in the API-SPEC, so the media UI does not fake one.
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
