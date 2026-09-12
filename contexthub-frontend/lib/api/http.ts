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
  /**
   * Stable discriminator from the backend, when it sent one. Branch on this
   * rather than on `status`: 429 is both "out of AI allowance" and ordinary
   * rate limiting, and those want very different treatment in the UI.
   */
  code?: string;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
    this.code = code;
  }

  /** The account has spent its daily AI allowance. */
  get isQuotaExceeded(): boolean {
    return this.code === "QUOTA_EXCEEDED";
  }

  /** Deep search runs are used up. Ordinary questions still work, so this is a
   *  different message from running out of tokens, not the same one. */
  get isAgentLimitReached(): boolean {
    return this.code === "AGENT_LIMIT_REACHED";
  }
}

/** Body the backend returns for a spent allowance, under `details`. */
export interface QuotaExceededDetails {
  used: number;
  limit: number;
  resetsAt: string;
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
    let code: string | undefined;
    try {
      const data = await res.json();
      // `details` falls back to the whole body: callers predating the typed
      // `details` field still read validation errors off it.
      details = data?.details ?? data;
      code = data?.code;
      message = Array.isArray(data?.message)
        ? data.message.join(", ")
        : data?.message ?? message;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message, details, code);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** GET a binary response (file download) with the Bearer token + one refresh. */
async function rawBlob(path: string, retry = true): Promise<Blob> {
  const headers: Record<string, string> = {};
  if (tokenStore.access) headers.Authorization = `Bearer ${tokenStore.access}`;

  const res = await fetch(`${API_BASE_URL}${path}`, { headers });

  if (res.status === 401 && retry && tokenStore.refresh) {
    refreshing ??= doRefresh().finally(() => (refreshing = null));
    const ok = await refreshing;
    if (ok) return rawBlob(path, false);
    tokenStore.clear();
  }
  if (!res.ok) throw new ApiError(res.status, res.statusText);
  return res.blob();
}

/**
 * POST a body and read the response as a Server-Sent Events stream, yielding
 * each frame's parsed `data:` payload.
 *
 * `EventSource` can't be used here: it is GET-only and cannot set an
 * Authorization header. Reading `response.body` gives us both, at the cost of
 * parsing the frames ourselves — which is only a split on the blank-line
 * separator, holding back the last partial frame until more bytes arrive.
 */
async function* rawStream<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
  retry = true,
): AsyncGenerator<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (tokenStore.access) headers.Authorization = `Bearer ${tokenStore.access}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (res.status === 401 && retry && tokenStore.refresh) {
    refreshing ??= doRefresh().finally(() => (refreshing = null));
    const ok = await refreshing;
    if (ok) {
      yield* rawStream<T>(path, body, signal, false);
      return;
    }
    tokenStore.clear();
  }

  if (!res.ok || !res.body) {
    // The error arrives as a normal JSON body — the stream never started.
    let message = res.statusText;
    let code: string | undefined;
    let details: unknown;
    try {
      const data = await res.json();
      message = Array.isArray(data?.message)
        ? data.message.join(", ")
        : data?.message ?? message;
      code = data?.code;
      details = data?.details;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message, details, code);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Frames are separated by a blank line; the tail is kept for next time.
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const line = frame.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        yield JSON.parse(payload) as T;
      }
    }
  } finally {
    // Aborting mid-answer must not leave the connection open.
    await reader.cancel().catch(() => {});
  }
}

export const http = {
  get: <T>(path: string, opts?: FetchOpts) => raw<T>(path, { ...opts, method: "GET" }),
  getBlob: (path: string) => rawBlob(path),
  postStream: <T>(path: string, body: unknown, signal?: AbortSignal) =>
    rawStream<T>(path, body, signal),
  post: <T>(path: string, body?: unknown, opts?: FetchOpts) =>
    raw<T>(path, { ...opts, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, opts?: FetchOpts) =>
    raw<T>(path, { ...opts, method: "PATCH", body }),
  del: <T>(path: string, opts?: FetchOpts) => raw<T>(path, { ...opts, method: "DELETE" }),
  upload: <T>(path: string, form: FormData) => raw<T>(path, { method: "POST", form }),
};
