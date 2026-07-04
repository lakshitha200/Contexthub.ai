"use client";

import { useEffect, useState } from "react";

/**
 * Reveals text progressively for a "streaming" feel. Reveals in small chunks
 * on a rAF-ish interval; calls onUpdate so the scroll can follow.
 */
export function useTypewriter(full: string, enabled: boolean, onUpdate?: () => void) {
  const [shown, setShown] = useState(enabled ? "" : full);

  useEffect(() => {
    if (!enabled) {
      setShown(full);
      return;
    }
    let i = 0;
    setShown("");
    const step = () => {
      // Reveal a few characters per tick, faster for long answers.
      i = Math.min(full.length, i + Math.max(2, Math.round(full.length / 90)));
      setShown(full.slice(0, i));
      onUpdate?.();
      if (i < full.length) timer = window.setTimeout(step, 16);
    };
    let timer = window.setTimeout(step, 16);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full, enabled]);

  const done = shown.length === full.length;
  return { shown, done };
}

export function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full bg-muted-foreground/60"
          style={{ animation: `caret-blink 1s ${i * 0.18}s infinite ease-in-out` }}
        />
      ))}
    </div>
  );
}
