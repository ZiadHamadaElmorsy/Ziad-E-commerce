/**
 * Pure upload-queue state helpers for the merchant product gallery (Phase 26).
 *
 * The gallery uploads MANY files with a bounded concurrency limit — never all
 * at once. This module holds the queue transition logic (pure functions, no
 * I/O) so it is trivially unit-testable; ProductGalleryManager wires it to the
 * real media/catalog API.
 */

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'error';

export interface UploadQueueItem {
  id: string;
  file: File;
  altText: string;
  status: UploadStatus;
  progress: number;
  error?: string;
}

/** Maximum simultaneous uploads (bounded concurrency — never 1000 at once). */
export const MAX_CONCURRENT_UPLOADS = 3;

/** Returns up to `limit` queued items that are ready to start uploading. */
export function takeNextQueued(
  queue: UploadQueueItem[],
  activeCount: number,
  limit: number = MAX_CONCURRENT_UPLOADS,
): UploadQueueItem[] {
  if (activeCount >= limit) return [];
  return queue.filter((item) => item.status === 'queued').slice(0, limit - activeCount);
}

export function markUploading(queue: UploadQueueItem[], id: string): UploadQueueItem[] {
  return queue.map((item) =>
    item.id === id ? { ...item, status: 'uploading', progress: 0, error: undefined } : item,
  );
}

export function markProgress(queue: UploadQueueItem[], id: string, percent: number): UploadQueueItem[] {
  return queue.map((item) => (item.id === id ? { ...item, progress: percent } : item));
}

export function markDone(queue: UploadQueueItem[], id: string): UploadQueueItem[] {
  return queue.map((item) => (item.id === id ? { ...item, status: 'done', progress: 100 } : item));
}

export function markError(queue: UploadQueueItem[], id: string, message: string): UploadQueueItem[] {
  return queue.map((item) =>
    item.id === id ? { ...item, status: 'error', error: message } : item,
  );
}

export function requeue(queue: UploadQueueItem[], id: string): UploadQueueItem[] {
  return queue.map((item) =>
    item.id === id ? { ...item, status: 'queued', progress: 0, error: undefined } : item,
  );
}

export function removeFromQueue(queue: UploadQueueItem[], id: string): UploadQueueItem[] {
  return queue.filter((item) => item.id !== id);
}

export function appendToQueue(queue: UploadQueueItem[], files: File[]): UploadQueueItem[] {
  const accepted = files.filter((file) => file.type.startsWith('image/'));
  if (accepted.length === 0) return queue;
  return [
    ...queue,
    ...accepted.map((file) => ({
      id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      file,
      altText: '',
      status: 'queued' as const,
      progress: 0,
    })),
  ];
}

export function countActive(queue: UploadQueueItem[]): number {
  return queue.filter((item) => item.status === 'uploading').length;
}
