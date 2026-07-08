/** Central client configuration. */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
  "http://localhost:4001/api/v1";

/**
 * When true, non-auth data (workspaces, documents, chat…) runs against the
 * in-memory mock. Auth can be toggled independently via NEXT_PUBLIC_REAL_AUTH,
 * so the login/register/OAuth flow can hit the real backend while the rest of
 * the app is still mocked.
 */
export const USE_MOCKS =
  (process.env.NEXT_PUBLIC_USE_MOCKS ?? "true").toLowerCase() !== "false";

/**
 * Force the auth namespace to use the real backend even when USE_MOCKS is true.
 * Auth is real when either mocks are fully off, or REAL_AUTH is explicitly on.
 */
export const REAL_AUTH =
  !USE_MOCKS ||
  (process.env.NEXT_PUBLIC_REAL_AUTH ?? "false").toLowerCase() === "true";

/** True when auth is served by the mock (used to gate demo prefills). */
export const AUTH_IS_MOCK = !REAL_AUTH;

/**
 * Force workspaces + collections + members to use the real backend even when
 * USE_MOCKS is true. (These three are interdependent — the workspace shell
 * loads collections for the current workspace — so they flip together.)
 */
export const REAL_WORKSPACES =
  !USE_MOCKS ||
  (process.env.NEXT_PUBLIC_REAL_WORKSPACES ?? "false").toLowerCase() === "true";

/**
 * Force documents + storage (upload, list, status polling, download, delete,
 * reprocess) to use the real backend even when USE_MOCKS is true.
 */
export const REAL_DOCUMENTS =
  !USE_MOCKS ||
  (process.env.NEXT_PUBLIC_REAL_DOCUMENTS ?? "false").toLowerCase() === "true";
