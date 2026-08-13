import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from './api-error';
import { translate } from './i18n-context';
import { en } from './translations';

const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
  translate(en, key, params);

describe('apiErrorMessage', () => {
  it('returns the backend message verbatim when one exists', () => {
    const error = new ApiError('A variant with this SKU already exists in this store.', {
      code: 'CONFLICT',
      status: 409,
    });
    expect(apiErrorMessage(error, t, 'products.new.failedToast')).toBe(
      'A variant with this SKU already exists in this store.',
    );
  });

  it('falls back to a translated generic for a backend code without a message', () => {
    const error = new ApiError('', { code: 'CONFLICT', status: 409 });
    expect(apiErrorMessage(error, t, 'products.new.failedToast')).toBe(
      'This change conflicts with an existing record.',
    );
  });

  it('maps network failures to the network error message', () => {
    const error = new ApiError('Failed to fetch', { code: 'REQUEST_FAILED', status: 0 });
    expect(apiErrorMessage(error, t, 'products.new.failedToast')).toBe(
      'Network error. Please check your connection and try again.',
    );
  });

  it('uses the caller fallback for unknown errors', () => {
    expect(apiErrorMessage('unexpected', t, 'products.new.failedToast')).toBe(
      'Failed to create the product.',
    );
    expect(apiErrorMessage(new Error('client error'), t, 'products.new.failedToast')).toBe(
      'client error',
    );
  });
});

describe('payment status label mapping', () => {
  it('maps every payment status to a translation key', async () => {
    const { paymentStatusLabelKey } = await import('@/lib/payments/payment-flow');
    expect(en[paymentStatusLabelKey('PENDING')]).toBe('Pending');
    expect(en[paymentStatusLabelKey('SUCCEEDED')]).toBe('Succeeded');
    expect(en[paymentStatusLabelKey('FAILED')]).toBe('Failed');
    expect(en[paymentStatusLabelKey('PROCESSING')]).toBe('Processing');
    expect(en[paymentStatusLabelKey('UNKNOWN' as never)]).toBe('Pending');
  });
});

describe('idempotency key generation', () => {
  it('generates a non-empty key', async () => {
    const { newIdempotencyKey } = await import('@/lib/api/payments');
    expect(newIdempotencyKey().length).toBeGreaterThan(8);
  });
});
