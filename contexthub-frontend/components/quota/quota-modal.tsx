"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Clock, Gauge, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuotaStore } from "@/lib/store/quota-store";

/**
 * "in about 5 hours", "in 12 minutes", or "shortly" when it is imminent.
 *
 * Read once at render rather than ticking. The reset is typically hours away,
 * so a live countdown would spend a render a second to change nothing anyone
 * would notice.
 */
function untilReset(resetsAt: string): string {
  const ms = new Date(resetsAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "shortly";

  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;

  const hours = Math.round(minutes / 60);
  return `in about ${hours} hour${hours === 1 ? "" : "s"}`;
}

/** Local time of day the allowance comes back, e.g. "1:00 AM". */
function resetClockTime(resetsAt: string): string {
  const date = new Date(resetsAt);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Shown when the account has spent its daily AI allowance.
 *
 * Deliberately not dismissible by clicking away or pressing Escape. Every path
 * that raises this has just refused to do what the user asked, and a modal that
 * vanishes on a stray click leaves them staring at a screen that silently did
 * nothing. They have to acknowledge it.
 *
 * It is mounted once, at the app shell, rather than at each call site: chat,
 * uploads and any future metered feature all fail the same way, and they should
 * all explain themselves the same way.
 */
export function QuotaModal() {
  const blocked = useQuotaStore((s) => s.blocked);
  const dismiss = useQuotaStore((s) => s.dismiss);

  return (
    <AnimatePresence>
      {blocked && (
        <motion.div
          className="fixed inset-0 z-[100] grid place-items-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="quota-title"
        >
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />

          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-pop"
          >
            <div className="relative overflow-hidden bg-gradient-brand px-6 py-7 text-center text-white">
              <div className="absolute inset-0 bg-grid opacity-20 mix-blend-overlay" />
              <div className="relative">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-white/25 bg-white/15 backdrop-blur">
                  <Gauge className="h-6 w-6" />
                </span>
                <h2 id="quota-title" className="mt-4 text-xl font-semibold tracking-tight">
                  You have used today&apos;s AI allowance
                </h2>
              </div>
            </div>

            <div className="px-6 py-6">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Every account gets a daily allowance of AI usage while
                ContextHub is in beta, so the service stays available for
                everyone. Yours resets automatically. Nothing is lost, and your
                documents and conversations are all still here.
              </p>

              <div className="mt-5 rounded-xl border border-border bg-secondary/50 p-4">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">Used today</span>
                  <span className="tabular-nums text-muted-foreground">
                    {blocked.used.toLocaleString()} / {blocked.limit.toLocaleString()}{" "}
                    tokens
                  </span>
                </div>
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-border">
                  <div className="h-full w-full rounded-full bg-gradient-brand" />
                </div>
                <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  Resets {untilReset(blocked.resetsAt)}
                  {resetClockTime(blocked.resetsAt) &&
                    `, at ${resetClockTime(blocked.resetsAt)} your time`}
                </p>
              </div>

              <div className="mt-5 rounded-xl border border-border p-4">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Meanwhile
                </p>
                <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                  <li>Read back any conversation you have already had.</li>
                  <li>Browse your documents and their summaries.</li>
                  <li>Invite teammates and set up collections.</li>
                </ul>
              </div>

              <Button size="lg" className="mt-6 w-full" onClick={dismiss}>
                Got it
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
