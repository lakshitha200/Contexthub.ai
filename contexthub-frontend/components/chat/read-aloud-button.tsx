"use client";

import { Volume2 } from "lucide-react";
import { SpeakingBars } from "@/components/chat/voice-wave";
import { useVoiceStore } from "@/lib/store/voice-store";
import { cn } from "@/lib/utils";

/**
 * Reads one answer aloud, on demand.
 *
 * Deliberately per-message rather than a global "read everything" switch:
 * having every answer start talking is disruptive, and the useful case is
 * almost always "read *that* one back to me".
 *
 * While playing, the icon is replaced by bars that step on real word
 * boundaries, and pressing again stops it.
 */
export function ReadAloudButton({
  messageId,
  text,
  className,
}: {
  messageId: string;
  text: string;
  className?: string;
}) {
  const ttsSupported = useVoiceStore((s) => s.ttsSupported);
  const speakingId = useVoiceStore((s) => s.speakingId);
  const pulse = useVoiceStore((s) => s.pulse);
  const toggle = useVoiceStore((s) => s.toggle);

  if (!ttsSupported || !text.trim()) return null;

  const speaking = speakingId === messageId;

  return (
    <button
      type="button"
      onClick={() => toggle(messageId, text)}
      aria-label={speaking ? "Stop reading" : "Read this answer aloud"}
      aria-pressed={speaking}
      title={speaking ? "Stop reading" : "Read aloud"}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors",
        speaking
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
        className,
      )}
    >
      {speaking ? (
        <>
          <SpeakingBars pulse={pulse} />
          Stop
        </>
      ) : (
        <>
          <Volume2 className="h-3.5 w-3.5" />
          Listen
        </>
      )}
    </button>
  );
}
