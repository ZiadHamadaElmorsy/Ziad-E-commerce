import { describe, expect, it } from 'vitest';
import { ApiError, toQueryString } from './client';

describe('api client helpers', () => {
  it('toQueryString skips empty values', () => {
    expect(toQueryString({ page: 2, search: '', status: 'ACTIVE', categoryId: undefined })).toBe(
      '?page=2&status=ACTIVE',
    );
  });

  it('toQueryString returns an empty string when there are no values', () => {
    expect(toQueryString({})).toBe('');
  });

  it('ApiError carries the backend error metadata', () => {
    const error = new ApiError('A product with this slug already exists.', {
      code: 'CONFLICT',
      status: 409,
    });
    expect(error.message).toBe('A product with this slug already exists.');
    expect(error.code).toBe('CONFLICT');
    expect(error.status).toBe(409);
    expect(error).toBeInstanceOf(Error);
  });
});
