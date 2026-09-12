"use client";

import { create } from "zustand";
import { api } from "@/lib/api";
import { ApiError, type QuotaExceededDetails } from "@/lib/api/http";
import type { UsageSummary } from "@/lib/types";

/**
 * Turn a refusal into a full meter reading.
 *
 * The refusal carries newer and more authoritative numbers than any poll, so it
 * is worth showing even when the meter never managed to load. Building the
 * whole shape here means the sidebar updates to "spent" at the same moment the
 * modal appears, rather than sitting on a stale percentage behind it.
 */
function spentFrom(details: QuotaExceededDetails, previous?: UsageSummary): UsageSummary {
  return {
    ...previous,
    used: details.used,
    limit: details.limit,
    resetsAt: details.resetsAt,
    remaining: 0,
    percentUsed: 100,
    allowed: false,
    calls: previous?.calls ?? 0,
    // A refusal only happens when enforcement is on, whatever a stale read said.
    enabled: true,
  };
}

interface QuotaState {
  /** Set while the "you are out" modal should be showing. */
  blocked: QuotaExceededDetails | null;
  /** Latest usage reading, for the meter. Undefined until first fetched. */
  usage: UsageSummary | undefined;

  /** Raise the modal. Called from wherever a request came back refused. */
  block: (details: QuotaExceededDetails) => void;
  dismiss: () => void;
  setUsage: (usage: UsageSummary) => void;
  /** Re-read the allowance from the server. Safe to call and ignore. */
  refresh: () => Promise<void>;
}

export const useQuotaStore = create<QuotaState>((set) => ({
  blocked: null,
  usage: undefined,

  block: (details) =>
    set((s) => ({ blocked: details, usage: spentFrom(details, s.usage) })),

  dismiss: () => set({ blocked: null }),

  setUsage: (usage) => set({ usage }),

  refresh: async () => {
    try {
      set({ usage: await api.usage.me() });
    } catch {
      // The meter is decoration. It must never break the page it sits in.
    }
  },
}));

/**
 * Route an error to the quota modal if that is what it is.
 *
 * Returns whether it handled the error, so call sites can skip their own toast
 * and avoid telling the user twice, in two different registers, about one
 * thing. Anything that is not a quota refusal is left entirely alone.
 */
export function handleQuotaError(err: unknown): boolean {
  if (err instanceof ApiError && err.isQuotaExceeded) {
    useQuotaStore.getState().block(err.details as QuotaExceededDetails);
    return true;
  }
  return false;
}

/**
 * Pull a fresh reading after something that just spent tokens.
 *
 * Fire and forget on purpose: the caller has already done the thing the user
 * asked for, and the meter catching up is not worth making them wait for.
 */
export function refreshQuota(): void {
  void useQuotaStore.getState().refresh();
}
