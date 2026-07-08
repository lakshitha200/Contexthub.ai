/**
 * Access/refresh token persistence. Kept out of React so the HTTP layer can
 * read/refresh tokens without a hook. Mirror in localStorage so a reload keeps
 * the session; an in-memory copy avoids re-reading storage on every request.
 */
import type { Tokens } from "./types";

const ACCESS_KEY = "ch.accessToken";
const REFRESH_KEY = "ch.refreshToken";

let access: string | null = null;
let refresh: string | null = null;
let hydrated = false;

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  access = window.localStorage.getItem(ACCESS_KEY);
  refresh = window.localStorage.getItem(REFRESH_KEY);
  hydrated = true;
}

export const tokenStore = {
  get access() {
    hydrate();
    return access;
  },
  get refresh() {
    hydrate();
    return refresh;
  },
  set(tokens: Tokens) {
    access = tokens.accessToken;
    refresh = tokens.refreshToken;
    hydrated = true;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ACCESS_KEY, tokens.accessToken);
      window.localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
    }
  },
  clear() {
    access = null;
    refresh = null;
    hydrated = true;
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(ACCESS_KEY);
      window.localStorage.removeItem(REFRESH_KEY);
    }
  },
  has() {
    hydrate();
    return Boolean(access);
  },
};
