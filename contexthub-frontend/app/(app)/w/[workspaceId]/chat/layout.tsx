"use client";

import { ChatProvider } from "@/components/chat/chat-context";
import { ConversationRail } from "@/components/chat/conversation-rail";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <ChatProvider>
      <div className="flex h-full">
        <div className="hidden w-[288px] shrink-0 md:block">
          <ConversationRail />
        </div>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </ChatProvider>
  );
}
