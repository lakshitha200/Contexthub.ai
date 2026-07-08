"use client";

import { createContext, useContext } from "react";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks/use-async";
import { useWorkspace } from "@/lib/store/workspace-context";
import type { Conversation } from "@/lib/types";

interface ChatContextValue {
  conversations: Conversation[];
  loading: boolean;
  reload: () => void;
  upsert: (conv: Conversation) => void;
  removeLocal: (id: string) => void;
}

const Ctx = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { workspaceId } = useWorkspace();
  const { data, loading, reload, setData } = useAsync(
    () => api.chat.listConversations(workspaceId),
    [workspaceId],
  );

  const conversations = data ?? [];

  const upsert = (conv: Conversation) =>
    setData((prev) => {
      const list = prev ?? [];
      const without = list.filter((c) => c.id !== conv.id);
      const next = [conv, ...without];
      return next.sort(
        (a, b) => Number(b.pinned) - Number(a.pinned) || +new Date(b.updatedAt) - +new Date(a.updatedAt),
      );
    });

  const removeLocal = (id: string) =>
    setData((prev) => (prev ?? []).filter((c) => c.id !== id));

  return (
    <Ctx.Provider value={{ conversations, loading, reload, upsert, removeLocal }}>
      {children}
    </Ctx.Provider>
  );
}

export function useChat() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
