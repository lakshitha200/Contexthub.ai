/** Central client configuration. */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
  "http://localhost:3000/api/v1";

/**
 * When true, the app runs entirely against an in-memory mock (no backend
 * needed). Flip to "false" once the NestJS backend is reachable + CORS is on.
 * Defaults to mocks so the UI is runnable out of the box.
 */
export const USE_MOCKS =
  (process.env.NEXT_PUBLIC_USE_MOCKS ?? "true").toLowerCase() !== "false";
