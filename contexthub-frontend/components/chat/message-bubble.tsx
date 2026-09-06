"use client";

import { motion } from "framer-motion";
import { AlertCircle, RotateCw } from "lucide-react";
import { SourcesButton } from "@/components/chat/citations";
import { MessageContent } from "@/components/chat/message-content";
import { ReadAloudButton } from "@/components/chat/read-aloud-button";
import { TypingDots } from "@/components/chat/typewriter";
import { Logo } from "@/components/brand";
import { Avatar } from "@/components/ui/avatar";
import { useAuthStore } from "@/lib/store/auth-store";
import type { Citation, Message } from "@/lib/types";

/** Opens the sources panel; `focus` scrolls to a specific citation. */
type OpenSources = (citations: Citation[], focus?: Citation) => void;

export function MessageBubble({
  message,
  onOpenSources,
  onRetry,
}: {
  message: Message;
  onOpenSources: OpenSources;
  onRetry?: () => void;
}) {
  const user = useAuthStore((s) => s.user);

  if (message.role === "USER") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex justify-end gap-3"
      >
        <div className="flex max-w-[80%] flex-col items-end gap-1.5">
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-wrap justify-end gap-1.5">
              {message.attachments.map((src, i) => (
                <a
                  key={i}
                  href={src}
                  target="_blank"
                  rel="noreferrer"
                  className="block h-24 w-24 overflow-hidden rounded-xl border border-border bg-secondary shadow-soft transition-transform hover:scale-[1.03]"
                >
                  {/* Object URL of a local file — next/image can't optimise blob: */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`Attachment ${i + 1}`}
                    className="h-full w-full object-cover"
                  />
                </a>
              ))}
            </div>
          )}
          <div className="rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[15px] leading-relaxed text-primary-foreground shadow-soft">
            {message.content}
          </div>
        </div>
        <Avatar name={user?.name ?? user?.email} src={user?.avatarUrl} size={32} className="mt-0.5" />
      </motion.div>
    );
  }

  return (
    <AssistantBubble message={message} onOpenSources={onOpenSources} onRetry={onRetry} />
  );
}

function AssistantBubble({
  message,
  onOpenSources,
  onRetry,
}: {
  message: Message;
  onOpenSources: OpenSources;
  onRetry?: () => void;
}) {
  // The answer arrives token by token from the server, so there is nothing to
  // simulate — render whatever has landed so far.
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex gap-3"
    >
      <span className="mt-0.5 shrink-0">
        <Logo size={32} />
      </span>
      <div className="min-w-0 max-w-[80%]">
        {message.pending ? (
          <div className="rounded-2xl rounded-tl-md border border-border bg-card px-4 py-3 shadow-soft">
            <TypingDots />
          </div>
        ) : message.error ? (
          <div className="rounded-2xl rounded-tl-md border border-danger/30 bg-danger/5 px-4 py-3">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              <div>
                <p className="text-sm text-foreground/90">
                  I couldn&apos;t generate an answer. The server may be busy or unreachable.
                </p>
                {onRetry && (
                  <button
                    onClick={onRetry}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium transition-colors hover:bg-secondary"
                  >
                    <RotateCw className="h-3.5 w-3.5" /> Try again
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl rounded-tl-md border border-border bg-card px-4 py-3 shadow-soft">
            <MessageContent content={message.content} />
            {!message.streaming && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {message.citations && message.citations.length > 0 && (
                  <SourcesButton
                    citations={message.citations}
                    onOpen={() => onOpenSources(message.citations ?? [])}
                  />
                )}
                <ReadAloudButton messageId={message.id} text={message.content} />
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
