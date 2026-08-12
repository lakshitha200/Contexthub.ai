"use client";

import { ArrowUp, Mic, Square, Volume2, VolumeX } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { useVoiceStore } from "@/lib/store/voice-store";
import { VOICE_ENABLED } from "@/lib/voice/config";
import { useVoiceInput } from "@/lib/voice/use-voice-input";
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

  const { readAloud, ttsSupported, toggleReadAloud } = useVoiceStore();
  // Speech-to-text: drop the transcript into the box; the user presses Send.
  const { supported: micSupported, listening, interim, start, stop } = useVoiceInput((text) => {
    setValue((v) => (v.trim() ? `${v.trim()} ${text}` : text));
    requestAnimationFrame(() => ref.current?.focus());
  });

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

  const showVoice = VOICE_ENABLED && (micSupported || ttsSupported);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-soft transition-shadow focus-within:shadow-pop focus-within:border-primary/40">
      <textarea
        ref={ref}
        rows={1}
        autoFocus={autoFocus}
        value={value}
        disabled={listening}
        placeholder={listening ? interim || "Listening…" : placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        className="scroll-slim block max-h-[200px] w-full resize-none bg-transparent px-4 pt-3.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/70 disabled:opacity-70"
      />
      <div className="flex items-center justify-between gap-2 px-3 pb-3 pt-1">
        <div className="min-w-0">{scopeSlot}</div>

        <div className="flex items-center gap-1.5">
          {showVoice && ttsSupported && (
            <button
              type="button"
              onClick={toggleReadAloud}
              title={readAloud ? "Turn off read-aloud" : "Read answers aloud"}
              aria-pressed={readAloud}
              className={cn(
                "grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors",
                readAloud
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-secondary",
              )}
            >
              {readAloud ? <Volume2 className="h-[18px] w-[18px]" /> : <VolumeX className="h-[18px] w-[18px]" />}
            </button>
          )}

          {showVoice && micSupported && (
            <button
              type="button"
              onClick={listening ? stop : start}
              disabled={busy}
              title={listening ? "Stop listening" : "Speak your question"}
              className={cn(
                "grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-all active:scale-95 disabled:opacity-50",
                listening
                  ? "animate-pulse bg-danger text-danger-foreground"
                  : "text-muted-foreground hover:bg-secondary",
              )}
            >
              {listening ? <Square className="h-4 w-4" /> : <Mic className="h-[18px] w-[18px]" />}
            </button>
          )}

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
    </div>
  );
}
