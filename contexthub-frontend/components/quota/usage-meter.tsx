"use client";

import { Gauge } from "lucide-react";
import { useEffect } from "react";
import { useQuotaStore } from "@/lib/store/quota-store";
import { cn } from "@/lib/utils";

/**
 * Small allowance readout for the sidebar.
 *
 * It exists so the limit is never a surprise. A cap you only meet by slamming
 * into it reads as the product being broken; a bar that has visibly been
 * filling all session reads as a rule you were told about.
 *
 * Quiet until it matters: below 60% used it is a plain grey line, and it only
 * takes on colour as the allowance runs down.
 */
export function UsageMeter() {
  const usage = useQuotaStore((s) => s.usage);
  const refresh = useQuotaStore((s) => s.refresh);

  // One read on mount. After that the value is pushed rather than polled: every
  // answer and upload refreshes it, and a refusal writes the exhausted figures
  // straight in. Polling on a timer would mostly be requests that change
  // nothing, on a free database tier with few connections to spare.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Hidden entirely when the server has quotas switched off: a meter for a
  // limit that is not enforced is just noise.
  if (!usage || !usage.enabled) return null;

  const pct = Math.min(100, Math.max(0, usage.percentUsed));
  const spent = pct >= 100;
  const low = pct >= 80;
  const warm = pct >= 60;

  return (
    <div
      className="px-3 pb-2"
      title={`${usage.used.toLocaleString()} of ${usage.limit.toLocaleString()} tokens used today`}
    >
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Gauge className="h-3 w-3" />
          Daily AI usage
        </span>
        <span className="tabular-nums">{pct}%</span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-border">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 ease-out",
            spent
              ? "bg-danger"
              : low
                ? "bg-warning"
                : warm
                  ? "bg-primary"
                  : "bg-muted-foreground/50",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {low && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {spent ? "Allowance spent. Resets at midnight UTC." : "Running low today."}
        </p>
      )}
    </div>
  );
}
