"use client";

import { motion } from "framer-motion";
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
}: {
  message: Message;
  animate?: boolean;
  onCite: (c: Citation) => void;
  onScroll?: () => void;
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

  return <AssistantBubble message={message} animate={animate} onCite={onCite} onScroll={onScroll} />;
}

function AssistantBubble({
  message,
  animate,
  onCite,
  onScroll,
}: {
  message: Message;
  animate?: boolean;
  onCite: (c: Citation) => void;
  onScroll?: () => void;
}) {
  const { shown, done } = useTypewriter(message.content, !!animate && !message.pending, onScroll);

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
