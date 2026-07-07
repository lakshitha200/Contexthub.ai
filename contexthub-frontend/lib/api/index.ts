import { mockApi } from "../mock/mock-api";
import { REAL_AUTH, USE_MOCKS } from "./config";
import type { Api } from "./contract";
import { realApi } from "./real";

/**
 * The single API entry point used across the app. Namespaces are wired
 * independently so auth can run live against the backend while the rest of the
 * app is still mocked:
 *   - auth   → real when REAL_AUTH (or mocks fully off)
 *   - others → real only when USE_MOCKS is off
 */
export const api: Api = {
  auth: REAL_AUTH ? realApi.auth : mockApi.auth,
  workspaces: USE_MOCKS ? mockApi.workspaces : realApi.workspaces,
  collections: USE_MOCKS ? mockApi.collections : realApi.collections,
  documents: USE_MOCKS ? mockApi.documents : realApi.documents,
  chat: USE_MOCKS ? mockApi.chat : realApi.chat,
};

export { ApiError } from "./http";
export type { Api } from "./contract";
