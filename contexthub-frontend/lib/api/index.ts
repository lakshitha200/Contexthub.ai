import type { Api } from "./contract";
import { realApi } from "./real";

/** The single API entry point used across the app (live NestJS backend). */
export const api: Api = realApi;

export { ApiError } from "./http";
export type { Api } from "./contract";
