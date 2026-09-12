"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, ImagePlus, Mic, Square, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { VoiceWave } from "@/components/chat/voice-wave";
import { useToast } from "@/components/ui/toast";
import {
  ATTACH_ACCEPT,
  MAX_ATTACHMENTS,
  isAttachableImage,
  rejectionReason,
  toPendingAttachment,
  type PendingAttachment,
} from "@/lib/chat/attachments";
import { VOICE_ENABLED } from "@/lib/voice/config";
import { useVoiceInput } from "@/lib/voice/use-voice-input";
import { cn } from "@/lib/utils";

export function ChatComposer({
  onSend,
  busy,
  placeholder = "Ask anything about your documents…",
  scopeSlot,
  modeSlot,
  autoFocus,
}: {
  onSend: (text: string, attachments: PendingAttachment[]) => void;
  busy?: boolean;
  placeholder?: string;
  scopeSlot?: React.ReactNode;
  /** Retrieval mode control, rendered beside the scope selector. */
  modeSlot?: React.ReactNode;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  // Speech-to-text: drop the transcript into the box; the user presses Send.
  // Nothing is auto-sent — the transcript is editable like anything typed.
  const {
    supported: micSupported,
    listening,
    interim,
    getLevel,
    start,
    stop,
  } = useVoiceInput({
    onResult: (text) => {
      setValue((v) => (v.trim() ? `${v.trim()} ${text}` : text));
      requestAnimationFrame(() => ref.current?.focus());
    },
    onError: (message) => toast("error", "Voice input", message),
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [value]);

  // Mirrored into a ref so the unmount cleanup below sees the latest list
  // without re-subscribing (and revoking) on every attachment change.
  const attachmentsRef = useRef<PendingAttachment[]>([]);
  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  // Release previews for anything still attached when the composer unmounts.
  // Sent attachments are already gone from this list — the caller owns those.
  useEffect(() => {
    return () => {
      for (const a of attachmentsRef.current) URL.revokeObjectURL(a.previewUrl);
    };
  }, []);

  async function addFiles(files: File[]) {
    const images = files.filter(isAttachableImage);
    if (images.length === 0) return;

    const room = MAX_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      toast("error", `Up to ${MAX_ATTACHMENTS} images per question`);
      return;
    }

    const accepted: PendingAttachment[] = [];
    for (const file of images.slice(0, room)) {
      const reason = rejectionReason(file);
      if (reason) {
        toast("error", `Can't attach ${file.name}`, reason);
        continue;
      }
      try {
        accepted.push(await toPendingAttachment(file));
      } catch {
        toast("error", `Couldn't read ${file.name}`);
      }
    }

    if (images.length > room) {
      toast("error", `Only ${room} more image${room === 1 ? "" : "s"} fit on this question`);
    }

    // Ignore a file already attached (same name, size and mtime).
    setAttachments((prev) => {
      const seen = new Set(prev.map((a) => a.id));
      const fresh = accepted.filter((a) => {
        if (seen.has(a.id)) {
          URL.revokeObjectURL(a.previewUrl);
          return false;
        }
        seen.add(a.id);
        return true;
      });
      return [...prev, ...fresh];
    });
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => {
      const gone = prev.find((a) => a.id === id);
      if (gone) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }

  function submit() {
    const text = value.trim();
    if (!text || busy) return;
    // Ownership of the preview URLs passes to the caller, which revokes them
    // when the message they belong to is replaced or the page unmounts.
    onSend(text, attachments);
    setValue("");
    setAttachments([]);
  }

  const showVoice = VOICE_ENABLED && micSupported;
  const full = attachments.length >= MAX_ATTACHMENTS;

  return (
    <div
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        // Ignore drags moving between children of the composer.
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDragging(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(false);
        void addFiles(Array.from(e.dataTransfer.files));
      }}
      className={cn(
        "rounded-2xl border bg-card shadow-soft transition-shadow focus-within:shadow-pop",
        dragging
          ? "border-primary bg-accent/30"
          : "border-border focus-within:border-primary/40",
      )}
    >
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="group relative h-16 w-16 overflow-hidden rounded-lg border border-border bg-secondary"
            >
              {/* Object URL of a local file — next/image can't optimise blob: */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.previewUrl} alt={a.name} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeAttachment(a.id)}
                aria-label={`Remove ${a.name}`}
                className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-md bg-background/80 text-muted-foreground opacity-0 backdrop-blur transition-opacity hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <textarea
        ref={ref}
        rows={1}
        autoFocus={autoFocus}
        value={value}
        placeholder={
          dragging
            ? "Drop images to attach…"
            : listening
              ? interim || "Listening…"
              : placeholder
        }
        onChange={(e) => setValue(e.target.value)}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData.files).filter(isAttachableImage);
          if (files.length === 0) return;
          e.preventDefault(); // don't also paste the filename as text
          void addFiles(files);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        className="scroll-slim block max-h-[200px] w-full resize-none bg-transparent px-4 pt-3.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/70 disabled:opacity-70"
      />

      {/* The listening ribbon. Grows out of the composer rather than replacing
          anything, so nothing below it jumps as it appears. */}
      <AnimatePresence initial={false}>
        {listening && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 44, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden px-3"
          >
            <VoiceWave active={listening} getLevel={getLevel} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between gap-2 px-3 pb-3 pt-1">
        {/* Scope and mode belong together: both change what the question
            searches, and both are decided before pressing send. */}
        <div className="flex min-w-0 items-center gap-1.5">
          {scopeSlot}
          {modeSlot}
        </div>

        <div className="flex items-center gap-1.5">
          <input
            ref={fileRef}
            type="file"
            hidden
            multiple
            accept={ATTACH_ACCEPT}
            onChange={(e) => {
              void addFiles(Array.from(e.target.files ?? []));
              e.target.value = ""; // let the same file be picked again
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy || full}
            title={
              full
                ? `Up to ${MAX_ATTACHMENTS} images per question`
                : "Attach an image (or paste a screenshot)"
            }
            aria-label="Attach an image"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ImagePlus className="h-[18px] w-[18px]" />
          </button>

          {showVoice && (
            <button
              type="button"
              onClick={listening ? stop : start}
              disabled={busy}
              title={listening ? "Stop listening" : "Speak your question"}
              aria-label={listening ? "Stop listening" : "Speak your question"}
              className={cn(
                "relative grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-all active:scale-95 disabled:opacity-50",
                listening
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary",
              )}
            >
              {/* A halo that breathes outward while the mic is open — calmer
                  than a pulsing fill, and it reads as "open" not "recording". */}
              {listening && (
                <span className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-primary/40 motion-safe:animate-[voice-halo_1.8s_ease-out_infinite]" />
              )}
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
