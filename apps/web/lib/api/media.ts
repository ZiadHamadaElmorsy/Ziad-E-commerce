import { api, apiUpload, toQueryString } from './client';
import { appConfig } from '@/lib/config';
import type { Envelope, ListMediaParams, MediaView, Paginated } from './types';

/**
 * Media API — every call hits the real backend
 * (POST/GET/DELETE /api/v1/media, docs/API-SPEC.md §29).
 *
 * Phase 25 adds the paginated media library read (GET /api/v1/media) so the
 * dashboard media page can list previously uploaded assets server-side instead
 * of being limited to the file just selected.
 */
export const mediaApi = {
  listMedia: (params: ListMediaParams = {}) =>
    api.get<Paginated<MediaView>>(`/media${toQueryString({ ...params })}`),

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

/**
 * Uploads a file through XMLHttpRequest with real progress events (Phase 26 —
 * the product gallery upload queue renders per-file progress). Same endpoint,
 * same auth + 401-refresh semantics as `apiUpload`; only the transport differs
 * so `xhr.upload.onprogress` can drive a progress bar.
 */
export async function mediaApiUploadWithProgress(
  file: File,
  onProgress: (percent: number) => void,
  altText?: string,
): Promise<Envelope<MediaView>> {
  const { getAccessToken, refreshAccessToken } = await import('@/lib/api/client');
  const qs = toQueryString(altText?.trim() ? { altText: altText.trim() } : {});

  const uploadOnce = (token: string) =>
    new Promise<Envelope<MediaView>>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${appConfig.apiUrl}/media${qs}`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText) as Envelope<MediaView>);
          } catch {
            reject(new Error('The media server returned an invalid response.'));
          }
          return;
        }
        reject(new Error(`Upload failed (${xhr.status}).`));
      };
      xhr.onerror = () => reject(new Error('Upload failed (network error).'));
      xhr.ontimeout = () => reject(new Error('Upload timed out.'));
      xhr.timeout = 5 * 60 * 1000;
      xhr.send(file);
    });

  const token = await getAccessToken();
  if (!token) {
    const { ApiError } = await import('@/lib/api/client');
    throw new ApiError('You are not signed in.', { code: 'NO_SESSION', status: 401 });
  }

  try {
    return await uploadOnce(token);
  } catch (caught) {
    // One 401-refresh retry (same semantics as apiRequest/apiUpload).
    if (caught instanceof Error && /401|Unauthorized/i.test(caught.message)) {
      const refreshed = await refreshAccessToken();
      if (refreshed) return uploadOnce(refreshed);
    }
    throw caught;
  }
}


