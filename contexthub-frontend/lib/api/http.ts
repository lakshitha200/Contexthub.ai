/**
 * Low-level fetch wrapper: injects the Bearer token, parses JSON/errors, and
 * transparently refreshes the access token once on a 401 (via the backend's
 * POST /auth/refresh, which reads the refresh token from the Bearer header).
 */
import { tokenStore } from "../token-store";
import type { Tokens } from "../types";
import { API_BASE_URL } from "./config";

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

type FetchOpts = {
  method?: string;
  body?: unknown;
  /** Send FormData (file upload) instead of JSON. */
  form?: FormData;
  /** Skip auth header (login/register/refresh). */
  anonymous?: boolean;
  signal?: AbortSignal;
};

let refreshing: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const refreshToken = tokenStore.refresh;
  if (!refreshToken) return false;
  try {
    // Backend reads the refresh token from the request BODY
    // (ExtractJwt.fromBodyField('refreshToken')), not the Authorization header.
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const tokens = (await res.json()) as Tokens;
    tokenStore.set(tokens);
    return true;
  } catch {
    return false;
  }
}

async function raw<T>(path: string, opts: FetchOpts, retry = true): Promise<T> {
  const headers: Record<string, string> = {};
  if (!opts.form) headers["Content-Type"] = "application/json";
  if (!opts.anonymous && tokenStore.access) {
    headers.Authorization = `Bearer ${tokenStore.access}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.form ?? (opts.body != null ? JSON.stringify(opts.body) : undefined),
    signal: opts.signal,
  });

  // Transparent single refresh on expiry.
  if (res.status === 401 && retry && !opts.anonymous && tokenStore.refresh) {
    refreshing ??= doRefresh().finally(() => (refreshing = null));
    const ok = await refreshing;
    if (ok) return raw<T>(path, opts, false);
    tokenStore.clear();
  }

  if (!res.ok) {
    let message = res.statusText;
    let details: unknown;
    try {
      const data = await res.json();
      details = data;
      message = Array.isArray(data?.message)
        ? data.message.join(", ")
        : data?.message ?? message;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message, details);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const http = {
  get: <T>(path: string, opts?: FetchOpts) => raw<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: FetchOpts) =>
    raw<T>(path, { ...opts, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, opts?: FetchOpts) =>
    raw<T>(path, { ...opts, method: "PATCH", body }),
  del: <T>(path: string, opts?: FetchOpts) => raw<T>(path, { ...opts, method: "DELETE" }),
  upload: <T>(path: string, form: FormData) => raw<T>(path, { method: "POST", form }),
};
