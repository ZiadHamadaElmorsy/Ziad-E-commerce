import { describe, expect, it } from 'vitest';
import {
  appendToQueue,
  countActive,
  markDone,
  markError,
  markProgress,
  markUploading,
  MAX_CONCURRENT_UPLOADS,
  removeFromQueue,
  requeue,
  takeNextQueued,
  type UploadQueueItem,
} from './product-gallery-queue';

function file(name: string, type = 'image/jpeg'): File {
  return new File(['x'], name, { type });
}

function item(partial: Partial<UploadQueueItem> & { id: string }): UploadQueueItem {
  return {
    file: file('x.jpg'),
    altText: '',
    status: 'queued',
    progress: 0,
    ...partial,
  };
}

describe('product-gallery-queue (upload queue helpers)', () => {
  it('appendToQueue accepts only image files and preserves existing items', () => {
    const queue = appendToQueue([], [
      file('a.jpg'),
      file('b.png'),
      file('c.pdf', 'application/pdf'),
    ]);
    expect(queue).toHaveLength(2);
    expect(queue.map((i) => i.status)).toEqual(['queued', 'queued']);
  });

  it('takeNextQueued respects the bounded concurrency limit', () => {
    const queue = [
      item({ id: '1', status: 'queued' }),
      item({ id: '2', status: 'queued' }),
      item({ id: '3', status: 'queued' }),
      item({ id: '4', status: 'queued' }),
    ];
    expect(MAX_CONCURRENT_UPLOADS).toBe(3);
    expect(takeNextQueued(queue, 0).map((i) => i.id)).toEqual(['1', '2', '3']);
    expect(takeNextQueued(queue, 2).map((i) => i.id)).toEqual(['1']);
    expect(takeNextQueued(queue, 3)).toEqual([]);
  });

  it('markUploading transitions a queued item and clears errors', () => {
    const next = markUploading([item({ id: '1' })], '1');
    expect(next[0].status).toBe('uploading');
    expect(next[0].progress).toBe(0);
  });

  it('markProgress updates the percent', () => {
    const next = markProgress([item({ id: '1', status: 'uploading' })], '1', 42);
    expect(next[0].progress).toBe(42);
  });

  it('markDone completes an upload', () => {
    const next = markDone([item({ id: '1', status: 'uploading', progress: 80 })], '1');
    expect(next[0].status).toBe('done');
    expect(next[0].progress).toBe(100);
  });

  it('markError records the failure message', () => {
    const next = markError([item({ id: '1', status: 'uploading' })], '1', 'boom');
    expect(next[0].status).toBe('error');
    expect(next[0].error).toBe('boom');
  });

  it('requeue resets an errored item to queued for retry', () => {
    const next = requeue([item({ id: '1', status: 'error', error: 'boom' })], '1');
    expect(next[0].status).toBe('queued');
    expect(next[0].error).toBeUndefined();
    expect(next[0].progress).toBe(0);
  });

  it('removeFromQueue drops an item', () => {
    const next = removeFromQueue(
      [item({ id: '1' }), item({ id: '2' })],
      '1',
    );
    expect(next.map((i) => i.id)).toEqual(['2']);
  });

  it('countActive counts uploading items only', () => {
    expect(
      countActive([
        item({ id: '1', status: 'uploading' }),
        item({ id: '2', status: 'queued' }),
        item({ id: '3', status: 'done' }),
      ]),
    ).toBe(1);
  });
});
