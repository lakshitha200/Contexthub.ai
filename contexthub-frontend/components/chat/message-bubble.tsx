"use client";

import { motion } from "framer-motion";
import { AlertCircle, RotateCw } from "lucide-react";
import { CitationsList } from "@/components/chat/citations";
import { MessageContent } from "@/components/chat/message-content";
import { TypingDots, useTypewriter } from "@/components/chat/typewriter";
import { Logo } from "@/components/brand";
import { Avatar } from "@/components/ui/avatar";
import { useAuthStore } from "@/lib/store/auth-store";
import type { Citation, Message } from "@/lib/types";

export function MessageBubble({
  message,
  animate,
  onCite,
  onScroll,
  onRetry,
}: {
  message: Message;
  animate?: boolean;
  onCite: (c: Citation) => void;
  onScroll?: () => void;
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
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[15px] leading-relaxed text-primary-foreground shadow-soft">
          {message.content}
        </div>
        <Avatar name={user?.name ?? user?.email} src={user?.avatarUrl} size={32} className="mt-0.5" />
      </motion.div>
    );
  }

  return (
    <AssistantBubble message={message} animate={animate} onCite={onCite} onScroll={onScroll} onRetry={onRetry} />
  );
}

function AssistantBubble({
  message,
  animate,
  onCite,
  onScroll,
  onRetry,
}: {
  message: Message;
  animate?: boolean;
  onCite: (c: Citation) => void;
  onScroll?: () => void;
  onRetry?: () => void;
}) {
  const { shown, done } = useTypewriter(
    message.content,
    !!animate && !message.pending && !message.error,
    onScroll,
  );

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
            <MessageContent
              content={shown}
              citations={message.citations}
              onCite={onCite}
            />
            {done && message.citations && message.citations.length > 0 && (
              <CitationsList citations={message.citations} onOpen={onCite} />
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
