"use client";

import { create } from "zustand";
import { api } from "../api";
import { tokenStore } from "../token-store";
import type { LoginPayload, RegisterPayload, RegisterResult, User } from "../types";

type Status = "idle" | "loading" | "authed" | "guest";

interface AuthState {
  user: User | null;
  status: Status;
  /** Load the session from stored tokens (called once on app mount). */
  bootstrap: () => Promise<void>;
  login: (p: LoginPayload) => Promise<void>;
  register: (p: RegisterPayload) => Promise<RegisterResult>;
  logout: () => Promise<void>;
  setUser: (u: User) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: "idle",

  async bootstrap() {
    if (!tokenStore.has()) {
      set({ status: "guest", user: null });
      return;
    }
    set({ status: "loading" });
    try {
      const user = await api.auth.me();
      set({ user, status: "authed" });
    } catch {
      tokenStore.clear();
      set({ status: "guest", user: null });
    }
  },

  async login(p) {
    const { user } = await api.auth.login(p);
    set({ user, status: "authed" });
  },

  // Registration doesn't sign the user in — they must verify their email first.
  async register(p) {
    return api.auth.register(p);
  },

  async logout() {
    await api.auth.logout();
    set({ user: null, status: "guest" });
  },

  setUser(user) {
    set({ user });
  },
}));
