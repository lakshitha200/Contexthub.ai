"use client";

import { ArrowUp } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function ChatComposer({
  onSend,
  busy,
  placeholder = "Ask anything about your documents…",
  scopeSlot,
  autoFocus,
}: {
  onSend: (text: string) => void;
  busy?: boolean;
  placeholder?: string;
  scopeSlot?: React.ReactNode;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  // Autosize the textarea up to a max height.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [value]);

  function submit() {
    const text = value.trim();
    if (!text || busy) return;
    onSend(text);
    setValue("");
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-soft transition-shadow focus-within:shadow-pop focus-within:border-primary/40">
      <textarea
        ref={ref}
        rows={1}
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        className="scroll-slim block max-h-[200px] w-full resize-none bg-transparent px-4 pt-3.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/70"
      />
      <div className="flex items-center justify-between gap-2 px-3 pb-3 pt-1">
        <div className="min-w-0">{scopeSlot}</div>
        <button
          onClick={submit}
          disabled={busy || !value.trim()}
          aria-label="Send"
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-all active:scale-95",
            value.trim() && !busy
              ? "bg-primary text-primary-foreground hover:brightness-110"
              : "bg-secondary text-muted-foreground",
          )}
        >
          <ArrowUp className="h-[18px] w-[18px]" />
        </button>
      </div>
    </div>
  );
}
