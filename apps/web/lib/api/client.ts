import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { appConfig } from '@/lib/config';

/**
 * Minimal typed API client for the real backend.
 *
 * - Reads the CURRENT access token from the authenticated Supabase session
 *   for every request (automatic access-token handling).
 * - Retries once after a 401 by refreshing the Supabase session.
 * - Parses the backend error envelope `{ error: { code, message, details } }`
 *   into a typed ApiError so the UI can render real API errors.
 * - Does NOT mock anything — every call goes to NEXT_PUBLIC_API_URL.
 */

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, opts: { code: string; status: number; details?: unknown }) {
    super(message);
    this.name = 'ApiError';
    this.code = opts.code;
    this.status = opts.status;
    this.details = opts.details;
  }
}

export interface ApiErrorEnvelope {
  error?: { code?: string; message?: string; details?: unknown };
}

interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function refreshAccessToken(): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.refreshSession();
  return data.session?.access_token ?? null;
}

async function doFetch(path: string, options: ApiRequestOptions, token: string): Promise<Response> {
  return fetch(`${appConfig.apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

async function parseError(response: Response): Promise<ApiError> {
  let envelope: ApiErrorEnvelope = {};
  try {
    envelope = (await response.json()) as ApiErrorEnvelope;
  } catch {
    // Non-JSON error body — fall through to a generic message.
  }
  return new ApiError(envelope.error?.message ?? `Request failed (${response.status}).`, {
    code: envelope.error?.code ?? 'REQUEST_FAILED',
    status: response.status,
    details: envelope.error?.details,
  });
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const token = await getAccessToken();
  if (!token) {
    throw new ApiError('You are not signed in.', { code: 'NO_SESSION', status: 401 });
  }

  let response = await doFetch(path, options, token);

  if (response.status === 401) {
    // The access token may have expired server-side. Refresh the Supabase
    // session once and retry before surfacing the error to the user.
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      response = await doFetch(path, options, refreshed);
    }
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, headers?: Record<string, string>) =>
    apiRequest<T>(path, { method: 'GET', headers }),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    apiRequest<T>(path, { method: 'POST', body, headers }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
};

/**
 * Raw-binary upload used by the Media API (POST /api/v1/media sends the file
 * body directly with its Content-Type). Authentication + 401 retry + error
 * envelope parsing are identical to `apiRequest`.
 */
export async function apiUpload<T>(
  path: string,
  body: BodyInit,
  contentType: string,
  query: Record<string, unknown> = {},
): Promise<T> {
  const token = await getAccessToken();
  if (!token) {
    throw new ApiError('You are not signed in.', { code: 'NO_SESSION', status: 401 });
  }

  const qs = toQueryString(query);
  let response = await fetch(`${appConfig.apiUrl}${path}${qs}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': contentType,
    },
    body,
  });

  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      response = await fetch(`${appConfig.apiUrl}${path}${qs}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${refreshed}`,
          'Content-Type': contentType,
        },
        body,
      });
    }
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  return (await response.json()) as T;
}

/** Builds a query string from a params object, skipping empty values. */
export function toQueryString(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}
