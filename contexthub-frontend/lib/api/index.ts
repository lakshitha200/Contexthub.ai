import { mockApi } from "../mock/mock-api";
import { USE_MOCKS } from "./config";
import type { Api } from "./contract";
import { realApi } from "./real";

/**
 * The single API entry point used across the app. Swaps between the live
 * backend and the in-memory mock via NEXT_PUBLIC_USE_MOCKS.
 */
export const api: Api = USE_MOCKS ? mockApi : realApi;

export { ApiError } from "./http";
export type { Api } from "./contract";
