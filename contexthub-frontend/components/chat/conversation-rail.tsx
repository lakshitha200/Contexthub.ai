"use client";

import { motion } from "framer-motion";
import { MessagesSquare, MoreHorizontal, Pin, PinOff, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useChat } from "@/components/chat/chat-context";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/misc";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/store/workspace-context";
import { cn, timeAgo } from "@/lib/utils";

export function ConversationRail() {
  const { workspaceId } = useWorkspace();
  const { conversations, loading, upsert, removeLocal } = useChat();
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const activeId = params.conversationId as string | undefined;
  const [query, setQuery] = useState("");
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(
    () => conversations.filter((c) => c.title.toLowerCase().includes(query.toLowerCase())),
    [conversations, query],
  );
  const pinned = filtered.filter((c) => c.pinned);
  const recent = filtered.filter((c) => !c.pinned);

  async function togglePin(id: string, pinned: boolean) {
    const updated = await api.chat.updateConversation(workspaceId, id, { pinned: !pinned });
    upsert(updated);
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.chat.removeConversation(workspaceId, toDelete);
      removeLocal(toDelete);
      toast("success", "Conversation deleted");
      if (activeId === toDelete) router.push(`/w/${workspaceId}/chat`);
    } catch {
      toast("error", "Couldn't delete conversation");
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  }

  return (
    <div className="flex h-full w-full flex-col border-r border-border bg-background">
      <div className="p-3">
        <Button className="w-full" onClick={() => router.push(`/w/${workspaceId}/chat`)}>
          <Plus className="h-4 w-4" /> New chat
        </Button>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search chats"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 pl-9"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 scroll-slim">
        {loading ? (
          <div className="space-y-2 p-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-11 rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <MessagesSquare className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {query ? "No matches" : "No conversations yet"}
            </p>
          </div>
        ) : (
          <>
            {pinned.length > 0 && (
              <Section label="Pinned">
                {pinned.map((c) => (
                  <RailItem key={c.id} {...{ c, activeId, workspaceId, togglePin, setToDelete }} />
                ))}
              </Section>
            )}
            {recent.length > 0 && (
              <Section label={pinned.length ? "Recent" : undefined}>
                {recent.map((c) => (
                  <RailItem key={c.id} {...{ c, activeId, workspaceId, togglePin, setToDelete }} />
                ))}
              </Section>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="Delete conversation?"
        description="This permanently removes the conversation and its messages."
        confirmLabel="Delete"
        danger
        loading={deleting}
      />
    </div>
  );
}

function Section({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      {label && (
        <p className="px-3 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
      )}
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function RailItem({
  c,
  activeId,
  workspaceId,
  togglePin,
  setToDelete,
}: {
  c: import("@/lib/types").Conversation;
  activeId?: string;
  workspaceId: string;
  togglePin: (id: string, pinned: boolean) => void;
  setToDelete: (id: string) => void;
}) {
  const active = c.id === activeId;
  return (
    <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="group relative">
      <Link
        href={`/w/${workspaceId}/chat/${c.id}`}
        className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
          active ? "bg-secondary text-foreground" : "text-foreground/80 hover:bg-secondary/60",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            {c.pinned && <Pin className="h-3 w-3 shrink-0 text-primary" />}
            <span className="truncate">{c.title}</span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{timeAgo(c.updatedAt)}</span>
        </span>
      </Link>
      <div className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100">
        <Dropdown
          align="end"
          trigger={
            <button className="rounded-md p-1 text-muted-foreground hover:bg-border hover:text-foreground">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          }
        >
          <DropdownItem
            icon={c.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            onClick={() => togglePin(c.id, c.pinned)}
          >
            {c.pinned ? "Unpin" : "Pin"}
          </DropdownItem>
          <DropdownItem danger icon={<Trash2 className="h-4 w-4" />} onClick={() => setToDelete(c.id)}>
            Delete
          </DropdownItem>
        </Dropdown>
      </div>
    </motion.div>
  );
}
