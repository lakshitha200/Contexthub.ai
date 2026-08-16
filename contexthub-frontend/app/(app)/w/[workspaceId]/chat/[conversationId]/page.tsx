"use client";

import { Globe, Layers } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, use, useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@/components/chat/chat-context";
import { ChatComposer } from "@/components/chat/chat-composer";
import { SourcesPanel } from "@/components/chat/citations";
import { MessageBubble } from "@/components/chat/message-bubble";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { attachmentHandoff, type PendingAttachment } from "@/lib/chat/attachments";
import { useVoiceStore } from "@/lib/store/voice-store";
import { useWorkspace } from "@/lib/store/workspace-context";
import type { Citation, Conversation, Message } from "@/lib/types";

export default function ConversationPage({
  params,
}: {
  params: Promise<{ workspaceId: string; conversationId: string }>;
}) {
  const { workspaceId, conversationId } = use(params);
  return (
    <Suspense fallback={null}>
      <ConversationView workspaceId={workspaceId} conversationId={conversationId} />
    </Suspense>
  );
}

function ConversationView({
  workspaceId,
  conversationId,
}: {
  workspaceId: string;
  conversationId: string;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const toast = useToast();
  const { collections } = useWorkspace();
  const { upsert } = useChat();

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [animateId, setAnimateId] = useState<string | null>(null);
  const [sources, setSources] = useState<{ list: Citation[]; focusDocId?: string } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sentQ = useRef(false);
  /** Images from the last question, so a retry can resend the same bytes. */
  const lastAttachments = useRef<PendingAttachment[]>([]);

  const scrollToBottom = useCallback((smooth = true) => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Sends `text` (plus any attached images) to the RAG endpoint. Renders an
  // inline error bubble on failure (no user message is appended here — that's
  // the caller's job).
  const runAsk = useCallback(
    async (text: string, attachments: PendingAttachment[] = []) => {
      setBusy(true);
      const pendingId = `pending_${Date.now()}`;
      const pending: Message = {
        id: pendingId,
        conversationId,
        role: "ASSISTANT",
        content: "",
        citations: null,
        createdAt: new Date().toISOString(),
        pending: true,
      };
      // Drop any prior error bubble, then show the typing indicator.
      setMessages((m) => [...m.filter((x) => !x.error), pending]);
      requestAnimationFrame(() => scrollToBottom());

      try {
        const { message } = await api.chat.ask(workspaceId, conversationId, {
          content: text,
          images: attachments.length ? attachments.map((a) => a.image) : undefined,
        });
        setMessages((m) => m.filter((x) => x.id !== pendingId).concat(message));
        setAnimateId(message.id);
        // Read the answer aloud when the user has voice read-aloud enabled.
        if (useVoiceStore.getState().readAloud) {
          useVoiceStore.getState().speak(message.content);
        }
        // Refresh conversation meta (title may have been set on first turn).
        const conv = await api.chat.getConversation(workspaceId, conversationId);
        setConversation(conv);
        upsert(conv);
      } catch {
        setMessages((m) =>
          m.map((x) =>
            x.id === pendingId ? { ...x, pending: false, error: true, content: "" } : x,
          ),
        );
      } finally {
        setBusy(false);
      }
    },
    [workspaceId, conversationId, scrollToBottom, upsert],
  );

  const send = useCallback(
    (text: string, attachments: PendingAttachment[] = []) => {
      useVoiceStore.getState().stopSpeaking(); // interrupt any answer being read
      const tempUser: Message = {
        id: `tmp_${Date.now()}`,
        conversationId,
        role: "USER",
        content: text,
        citations: null,
        createdAt: new Date().toISOString(),
        // Show what was sent. These previews belong to this page now, and are
        // revoked on unmount (see the cleanup effect below).
        attachments: attachments.length
          ? attachments.map((a) => a.previewUrl)
          : undefined,
      };
      setMessages((m) => [...m, tempUser]);
      // Keep the attachments for retry — the backend never stores them, so a
      // retry has to resend the bytes.
      lastAttachments.current = attachments;
      void runAsk(text, attachments);
    },
    [conversationId, runAsk],
  );

  // Retry the last question after an error (reuses the last user message and
  // whatever images went with it).
  const retry = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === "USER");
    if (lastUser) void runAsk(lastUser.content, lastAttachments.current);
  }, [messages, runAsk]);

  // Load the conversation.
  useEffect(() => {
    let active = true;
    setLoading(true);
    api.chat
      .getConversation(workspaceId, conversationId)
      .then((conv) => {
        if (!active) return;
        setConversation(conv);
        setMessages(conv.messages);
      })
      .catch(() => active && toast("error", "Conversation not found"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [workspaceId, conversationId, toast]);

  // Stop any read-aloud when leaving the conversation or switching chats.
  useEffect(() => {
    return () => useVoiceStore.getState().stopSpeaking();
  }, [conversationId]);

  // Auto-send the handoff question from the "new chat" screen (once), together
  // with any images that screen left in the hand-off slot.
  useEffect(() => {
    const q = search.get("q");
    if (!loading && q && !sentQ.current) {
      sentQ.current = true;
      router.replace(`/w/${workspaceId}/chat/${conversationId}`);
      void send(q, attachmentHandoff.take());
    }
  }, [loading, search, send, router, workspaceId, conversationId]);

  // Attachment previews are object URLs owned by this page — release them when
  // the user leaves, or they leak for the lifetime of the tab.
  useEffect(() => {
    const held = lastAttachments;
    return () => {
      for (const a of held.current) URL.revokeObjectURL(a.previewUrl);
      held.current = [];
    };
  }, [conversationId]);

  useEffect(() => {
    scrollToBottom(false);
  }, [messages.length, scrollToBottom]);

  const scopeCollection = collections.find((c) => c.id === conversation?.collectionId);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-14 items-center gap-3 border-b border-border px-5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">
            {conversation?.title ?? "Conversation"}
          </h2>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
          {scopeCollection ? (
            <>
              <Layers className="h-3.5 w-3.5" /> {scopeCollection.name}
            </>
          ) : (
            <>
              <Globe className="h-3.5 w-3.5" /> Whole workspace
            </>
          )}
        </span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto scroll-slim">
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
          {loading ? (
            <div className="space-y-6">
              <Skeleton className="ml-auto h-12 w-2/3 rounded-2xl" />
              <Skeleton className="h-28 w-4/5 rounded-2xl" />
            </div>
          ) : (
            messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                animate={m.id === animateId}
                onOpenSources={(list, focus) =>
                  setSources({ list, focusDocId: focus?.documentId })
                }
                onScroll={() => scrollToBottom(false)}
                onRetry={m.error ? retry : undefined}
              />
            ))
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="mx-auto w-full max-w-3xl px-4 pb-6">
        <ChatComposer autoFocus busy={busy} onSend={send} />
      </div>

      <SourcesPanel
        citations={sources?.list ?? null}
        focusDocId={sources?.focusDocId}
        onClose={() => setSources(null)}
      />
    </div>
  );
}
