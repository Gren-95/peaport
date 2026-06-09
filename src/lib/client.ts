'use client';

/** Client-side helpers for calling the panel API with CSRF protection. */
import type { ApiResponse } from '@/types';

let csrfToken = '';

export function setCsrfToken(token: string): void {
  csrfToken = token;
}
export function getCsrfToken(): string {
  return csrfToken;
}

export class ApiClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && method !== 'HEAD') headers['x-csrf-token'] = csrfToken;

  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
    credentials: 'same-origin',
  });

  let parsed: ApiResponse<T> | null = null;
  try {
    parsed = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new ApiClientError('INVALID_RESPONSE', `Unexpected response (${res.status}).`, res.status);
  }

  if (!parsed.success) {
    throw new ApiClientError(parsed.error.code, parsed.error.message, res.status, parsed.error.details);
  }
  return parsed.data;
}

/** SWR fetcher returning the unwrapped data payload. */
export const swrFetcher = <T>(path: string): Promise<T> => api<T>(path);
