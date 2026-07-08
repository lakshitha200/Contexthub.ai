import { mockApi } from "../mock/mock-api";
import { REAL_AUTH, REAL_DOCUMENTS, REAL_WORKSPACES, USE_MOCKS } from "./config";
import type { Api } from "./contract";
import { realApi } from "./real";

/**
 * The single API entry point used across the app. Namespaces are wired
 * independently so each backend module can be brought online in stages:
 *   - auth                     → real when REAL_AUTH (or mocks fully off)
 *   - workspaces + collections → real when REAL_WORKSPACES (or mocks fully off)
 *   - documents + storage      → real when REAL_DOCUMENTS (or mocks fully off)
 *   - chat                     → real only when USE_MOCKS is off
 */
export const api: Api = {
  auth: REAL_AUTH ? realApi.auth : mockApi.auth,
  workspaces: REAL_WORKSPACES ? realApi.workspaces : mockApi.workspaces,
  collections: REAL_WORKSPACES ? realApi.collections : mockApi.collections,
  documents: REAL_DOCUMENTS ? realApi.documents : mockApi.documents,
  chat: USE_MOCKS ? mockApi.chat : realApi.chat,
};

export { ApiError } from "./http";
export type { Api } from "./contract";
