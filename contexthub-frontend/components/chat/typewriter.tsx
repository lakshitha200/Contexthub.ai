"use client";

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
