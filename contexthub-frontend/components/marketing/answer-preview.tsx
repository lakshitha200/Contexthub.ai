"use client";

import { motion } from "framer-motion";
import { BarChart3, FileText, Quote, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * A still of a real answer, used as the hero visual.
 *
 * It types the answer out once on load rather than looping. A loop would pull
 * the eye away from the headline every few seconds, and the point here is to
 * show the shape of an answer (grounded text, then the sources it came from),
 * not to run a demo.
 */
const ANSWER =
  "Revenue grew 12% year over year to $4.8M, driven mainly by the enterprise tier. Churn fell to 2.1%, the lowest in six quarters.";

const CITATIONS = [
  { icon: FileText, label: "FY25-annual-report.pdf", detail: "page 14", tone: "primary" as const },
  { icon: BarChart3, label: "Q4-metrics.xlsx", detail: "revenue chart", tone: "cyan" as const },
];

function useTypewriter(text: string, speed = 18) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (count >= text.length) return;
    const id = setTimeout(() => setCount((c) => c + 1), speed);
    return () => clearTimeout(id);
  }, [count, text.length, speed]);

  // The remainder is returned too, not thrown away. It stays in the DOM at
  // zero opacity so the sentence is complete for crawlers, and so the no-JS
  // stylesheet can reveal it when the typing will never run.
  return {
    shown: text.slice(0, count),
    rest: text.slice(count),
    done: count >= text.length,
  };
}

export function AnswerPreview() {
  const { shown, rest, done } = useTypewriter(ANSWER);

  return (
    <div className="relative">
      {/* Soft brand glow behind the card. Decorative only. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-8 -z-10 rounded-[2rem] opacity-70 blur-3xl"
        style={{ background: "var(--gradient-brand)", opacity: 0.16 }}
      />

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-pop">
        {/* Window chrome. Sells it as a product shot without faking a browser. */}
        <div className="flex items-center gap-2 border-b border-border bg-secondary/50 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-danger/50" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/50" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/50" />
          <span className="ml-2 text-xs text-muted-foreground">Finance workspace</span>
        </div>

        <div className="space-y-5 p-5">
          {/* The question. */}
          <div className="flex justify-end">
            <div className="max-w-[80%] rounded-2xl rounded-br-md bg-gradient-brand px-4 py-2.5 text-sm text-white shadow-soft">
              How did revenue and churn move last year?
            </div>
          </div>

          {/* The answer. */}
          <div className="flex gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] leading-relaxed text-foreground/90">
                {shown}
                {!done && (
                  <>
                    <span className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] bg-primary align-baseline animate-[caret-blink_1s_step-end_infinite]" />
                    <span data-reveal style={{ opacity: 0 }}>
                      {rest}
                    </span>
                  </>
                )}
              </p>

              {/* Sources appear only once the answer has finished, which is
                  also how the real chat behaves. */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={done ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                data-reveal
                className="mt-4"
              >
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Quote className="h-3 w-3" />
                  Sources
                </p>
                <div className="flex flex-wrap gap-2">
                  {CITATIONS.map(({ icon: Icon, label, detail, tone }) => (
                    <span
                      key={label}
                      className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs"
                    >
                      <Icon
                        className={
                          tone === "cyan"
                            ? "h-3.5 w-3.5 shrink-0 text-cyan"
                            : "h-3.5 w-3.5 shrink-0 text-primary"
                        }
                      />
                      {/* Filenames are the one unbounded string in this card,
                          so it truncates rather than pushing the card wide. */}
                      <span className="truncate font-medium">{label}</span>
                      <span className="shrink-0 text-muted-foreground">{detail}</span>
                    </span>
                  ))}
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
