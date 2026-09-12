"use client";

import { motion } from "framer-motion";
import { FileText, Layers, Sparkles, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useChat } from "@/components/chat/chat-context";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ScopeSelector } from "@/components/chat/scope-selector";
import { Logo } from "@/components/brand";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { attachmentHandoff, type PendingAttachment } from "@/lib/chat/attachments";
import { handleQuotaError } from "@/lib/store/quota-store";
import { useWorkspace } from "@/lib/store/workspace-context";

const SUGGESTIONS = [
  { icon: Sparkles, text: "Summarise the key findings across my documents" },
  { icon: TrendingUp, text: "What do the tables and charts actually show?" },
  { icon: Layers, text: "Compare how these files approach the same topic" },
  { icon: FileText, text: "Draft an executive summary from the latest upload" },
];

export default function NewChatPage() {
  const router = useRouter();
  const toast = useToast();
  const { workspaceId, workspace } = useWorkspace();
  const { upsert } = useChat();
  const [scope, setScope] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start(text: string, attachments: PendingAttachment[] = []) {
    setBusy(true);
    try {
      const conv = await api.chat.createConversation(workspaceId, {
        title: text.slice(0, 60),
        collectionId: scope ?? undefined,
      });
      upsert(conv);
      // The question rides along in the URL; images are far too large for that,
      // so they wait in the hand-off slot for the conversation page to claim.
      attachmentHandoff.set(attachments);
      router.push(`/w/${workspaceId}/chat/${conv.id}?q=${encodeURIComponent(text)}`);
    } catch (err) {
      attachmentHandoff.take(); // don't leave a stale hand-off behind
      for (const a of attachments) URL.revokeObjectURL(a.previewUrl);
      // The quota modal already says what happened; a toast as well would tell
      // them the same thing twice in two different registers.
      if (!handleQuotaError(err)) toast("error", "Couldn't start conversation");
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="bg-aurora flex flex-1 flex-col items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-2xl text-center"
        >
          <div className="mb-5 flex justify-center">
            <Logo size={56} />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Ask <span className="text-gradient">{workspace?.name ?? "your workspace"}</span>
          </h1>
          <p className="mt-2 text-muted-foreground">
            Grounded answers from your documents. Every claim is cited back to its source.
          </p>

          <div className="mt-8 grid gap-2.5 sm:grid-cols-2">
            {SUGGESTIONS.map((s, i) => (
              <motion.button
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.05 }}
                onClick={() => start(s.text)}
                disabled={busy}
                className="hover-lift group relative flex items-center gap-3 overflow-hidden rounded-xl border border-border bg-card p-3.5 text-left text-sm shadow-soft disabled:opacity-60"
              >
                <span className="sheen absolute inset-0" />
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground transition-transform duration-300 group-hover:scale-105">
                  <s.icon className="h-4 w-4" />
                </span>
                <span className="text-foreground/90">{s.text}</span>
              </motion.button>
            ))}
          </div>
        </motion.div>
      </div>

      <div className="mx-auto w-full max-w-2xl px-4 pb-6">
        <ChatComposer
          autoFocus
          busy={busy}
          onSend={start}
          scopeSlot={<ScopeSelector value={scope} onChange={setScope} />}
        />
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Answers come only from this workspace. Beta software, so check the cited sources.
        </p>
      </div>
    </div>
  );
}
