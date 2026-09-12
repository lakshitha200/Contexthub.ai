"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Globe, Layers, Telescope } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, use, useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@/components/chat/chat-context";
import { ChatComposer } from "@/components/chat/chat-composer";
import { DeepSearchToggle } from "@/components/chat/deep-search-toggle";
import { SourcesPanel } from "@/components/chat/citations";
import { MessageBubble } from "@/components/chat/message-bubble";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import {
  handleQuotaError,
  isAgentLimitError,
  refreshQuota,
} from "@/lib/store/quota-store";
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
  /** Whether the next question uses the research agent. Resets per turn below. */
  const [deepSearch, setDeepSearch] = useState(false);
  /** What deep search is doing right now, shown while it gathers. */
  const [agentStatus, setAgentStatus] = useState<string>();
  const [sources, setSources] = useState<{ list: Citation[]; focusDocId?: string } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sentQ = useRef(false);
  /** Images from the last question, so a retry can resend the same bytes. */
  const lastAttachments = useRef<PendingAttachment[]>([]);
  /** The in-flight answer stream, so navigating away can abort it. */
  const streamRef = useRef<AbortController | null>(null);
  const lastDeepSearch = useRef(false);

  const scrollToBottom = useCallback((smooth = true) => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Sends `text` (plus any attached images) to the RAG endpoint. Renders an
  // inline error bubble on failure (no user message is appended here — that's
  // the caller's job).
  const runAsk = useCallback(
    async (text: string, attachments: PendingAttachment[] = [], deep = false) => {
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

      // Aborted when the user leaves the conversation mid-answer.
      const controller = new AbortController();
      streamRef.current?.abort();
      streamRef.current = controller;

      try {
        let streamed = "";
        let settled = false;

        for await (const event of api.chat.askStream(
          workspaceId,
          conversationId,
          {
            content: text,
            images: attachments.length ? attachments.map((a) => a.image) : undefined,
            ...(deep ? { deepSearch: true } : {}),
          },
          controller.signal,
        )) {
          if (event.type === "delta") {
            // First token means the research phase is over.
            if (streamed === "") setAgentStatus(undefined);
            streamed += event.text;
            // First token: swap the typing dots for the answer as it arrives.
            setMessages((m) =>
              m.map((x) =>
                x.id === pendingId
                  ? { ...x, pending: false, streaming: true, content: streamed }
                  : x,
              ),
            );
            scrollToBottom();
          } else if (event.type === "status") {
            // Deep search only: several seconds pass before the first word is
            // written, and naming the search in flight is the difference
            // between "working" and "hung".
            setAgentStatus(
              event.stage === "searching" && event.detail
                ? `Searching for “${event.detail}”`
                : event.stage === "found" && event.detail
                  ? `Read results for “${event.detail}”`
                  : "Working out what to look for",
            );
          } else if (event.type === "done") {
            settled = true;
            // The real row — carries the persisted id and the citations, which
            // only exist once the whole answer has been written.
            setMessages((m) =>
              m.map((x) => (x.id === pendingId ? event.message : x)),
            );
          } else {
            // Rebuild the ApiError the frame stands in for, so a refusal that
            // arrived mid-stream is handled exactly like one that arrived as a
            // JSON body. Without this an exhausted allowance reads as a broken
            // answer instead of raising the modal that explains it.
            throw new ApiError(
              event.statusCode,
              event.message,
              event.details,
              event.code,
            );
          }
        }

        if (!settled) throw new Error("The answer ended unexpectedly.");

        // That turn spent tokens, and a deep run spent one of the day's runs,
        // so let the meter and the toggle's counter catch up.
        refreshQuota();

        // Refresh conversation meta (title may have been set on first turn).
        const conv = await api.chat.getConversation(workspaceId, conversationId);
        setConversation(conv);
        upsert(conv);
      } catch (err) {
        // Leaving the page aborts the stream: not a failure to report.
        if (controller.signal.aborted) return;

        // Out of allowance. The modal explains it, so drop the placeholder
        // rather than leaving a bubble marked "failed": nothing went wrong,
        // the question simply was not asked.
        if (handleQuotaError(err)) {
          setMessages((m) => m.filter((x) => x.id !== pendingId));
          return;
        }

        // Deep search is used up. Drop the placeholder and say so, rather than
        // rendering a failed answer: the question was never asked, and asking
        // it again without the toggle will work.
        if (isAgentLimitError(err)) {
          setMessages((m) => m.filter((x) => x.id !== pendingId));
          setDeepSearch(false);
          refreshQuota();
          toast(
            "info",
            "Deep search used up for today",
            "Ask again without it and you will still get a cited answer.",
          );
          return;
        }

        setMessages((m) =>
          m.map((x) =>
            x.id === pendingId ? { ...x, pending: false, error: true, content: "" } : x,
          ),
        );
      } finally {
        if (streamRef.current === controller) streamRef.current = null;
        setAgentStatus(undefined);
        setBusy(false);
      }
    },
    [workspaceId, conversationId, scrollToBottom, upsert],
  );

  const send = useCallback(
    (
      text: string,
      attachments: PendingAttachment[] = [],
      // The "new chat" screen makes the mode choice before this page exists, so
      // the first question needs to carry it in rather than read our state.
      deepOverride?: boolean,
    ) => {
      const deep = deepOverride ?? deepSearch;
      useVoiceStore.getState().stop(); // interrupt any answer being read
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
      lastDeepSearch.current = deep;
      void runAsk(text, attachments, deep);
      // One run is one question. Leaving it on would silently spend tomorrow's
      // allowance on a follow-up the user never chose to make expensive.
      setDeepSearch(false);
    },
    [conversationId, runAsk, deepSearch],
  );

  // Retry the last question after an error (reuses the last user message and
  // whatever images went with it).
  const retry = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === "USER");
    // Retries deliberately fall back to the ordinary path: the run was already
    // counted, and spending a second one on a question that just failed is the
    // last thing someone with one run a day wants.
    if (lastUser) void runAsk(lastUser.content, lastAttachments.current, false);
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

  // Leaving the conversation stops anything still talking and drops the
  // in-flight stream. The backend finishes and saves the answer regardless, so
  // it is waiting here on the way back.
  useEffect(() => {
    return () => {
      useVoiceStore.getState().stop();
      streamRef.current?.abort();
      streamRef.current = null;
    };
  }, [conversationId]);

  // Auto-send the handoff question from the "new chat" screen (once), together
  // with any images that screen left in the hand-off slot.
  useEffect(() => {
    const q = search.get("q");
    if (!loading && q && !sentQ.current) {
      sentQ.current = true;
      const deep = search.get("deep") === "1";
      router.replace(`/w/${workspaceId}/chat/${conversationId}`);
      void send(q, attachmentHandoff.take(), deep);
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
                onOpenSources={(list, focus) =>
                  setSources({ list, focusDocId: focus?.documentId })
                }
                onRetry={m.error ? retry : undefined}
              />
            ))
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="mx-auto w-full max-w-3xl px-4 pb-6">
        {/* Research progress. Sits above the box rather than inside the answer
            bubble because it is not part of the answer: it disappears the
            moment the first token arrives. */}
        <AnimatePresence>
          {agentStatus && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="mb-2 flex items-center gap-2 px-1 text-xs text-muted-foreground"
            >
              <Telescope className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="truncate">{agentStatus}</span>
              <span className="ml-auto shrink-0 tabular-nums opacity-70">
                deep search
              </span>
            </motion.p>
          )}
        </AnimatePresence>

        <ChatComposer
          autoFocus
          busy={busy}
          onSend={send}
          modeSlot={
            <DeepSearchToggle
              value={deepSearch}
              onChange={setDeepSearch}
              disabled={busy}
            />
          }
        />
      </div>

      <SourcesPanel
        citations={sources?.list ?? null}
        focusDocId={sources?.focusDocId}
        onClose={() => setSources(null)}
      />
    </div>
  );
}
