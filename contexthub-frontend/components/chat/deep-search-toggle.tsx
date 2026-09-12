"use client";

import { Telescope } from "lucide-react";
import { useEffect } from "react";
import { useQuotaStore } from "@/lib/store/quota-store";
import { cn } from "@/lib/utils";

/**
 * Switches the question between one-shot retrieval and the research agent.
 *
 * Off by default, and deliberately so. Deep search costs several model calls
 * where a normal question costs two, and most questions are simple lookups that
 * gain nothing from it. Making it opt-in means the expensive path is chosen for
 * the questions that actually need it.
 *
 * The remaining-runs count is on the button rather than hidden in a tooltip,
 * because with an allowance this small the user has to be able to decide
 * whether *this* question is worth it before they spend it.
 */
export function DeepSearchToggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const usage = useQuotaStore((s) => s.usage);
  const refresh = useQuotaStore((s) => s.refresh);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const remaining = usage?.agentRunsRemaining ?? 0;
  const spent = usage ? remaining <= 0 : false;

  // A spent allowance must not leave the toggle stuck on, or the next question
  // would be refused for a mode the user can no longer turn off.
  useEffect(() => {
    if (spent && value) onChange(false);
  }, [spent, value, onChange]);

  // Hidden rather than disabled when the server has it switched off: a control
  // for a feature that does not exist is worse than no control. Placed after
  // every hook, so the hook order never changes between renders.
  if (usage && !usage.agentEnabled) return null;

  const label = spent
    ? "Deep search used up for today. Resets at midnight UTC."
    : value
      ? `Deep search on. ${remaining} left today.`
      : `Deep search: search several times before answering. ${remaining} left today.`;

  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      disabled={disabled || spent}
      aria-pressed={value}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5",
        "text-xs font-medium transition-all duration-200",
        "disabled:cursor-not-allowed disabled:opacity-50",
        value
          ? "border-transparent bg-gradient-brand text-white shadow-soft"
          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      <Telescope className="h-3.5 w-3.5" />
      Deep search
      {!spent && (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
            value ? "bg-white/20" : "bg-secondary",
          )}
        >
          {remaining}
        </span>
      )}
    </button>
  );
}
