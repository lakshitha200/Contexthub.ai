"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronRight,
  FileText,
  Image as ImageIcon,
  Quote,
  ScanLine,
  Table as TableIcon,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/store/workspace-context";
import type { ChunkKind, Citation } from "@/lib/types";

/** A stable identity for a deduped source entry. */
function citationKey(c: Citation): string {
  return `${c.documentId}:${c.kind}`;
}

/**
 * Collapse passages from the same document into one source entry — but keep
 * different kinds apart, so a document that answered with both a table and a
 * chart shows both rather than hiding whichever scored lower.
 */
export function dedupeCitations(citations: Citation[]): Citation[] {
  const best = new Map<string, Citation>();
  for (const c of citations) {
    const key = citationKey(c);
    const existing = best.get(key);
    if (!existing || c.score > existing.score) best.set(key, c);
  }
  return [...best.values()];
}

const KIND_META: Record<
  ChunkKind,
  { label: string; icon: typeof FileText } | null
> = {
  TEXT: null, // the default — no badge needed
  TABLE: { label: "Table", icon: TableIcon },
  IMAGE: { label: "Chart or image", icon: ImageIcon },
  OCR: { label: "Scanned page", icon: ScanLine },
};

/** Compact "N sources" affordance under an answer (opens the panel). */
export function SourcesButton({
  citations,
  onOpen,
}: {
  citations: Citation[];
  onOpen: () => void;
}) {
  const n = dedupeCitations(citations).length;
  if (!n) return null;
  return (
    <button
      onClick={onOpen}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-2.5 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:border-primary/40 hover:bg-secondary"
    >
      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
      {n} source{n > 1 ? "s" : ""}
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
    </button>
  );
}

/**
 * Right-side panel listing the sources behind an answer. Open when `citations`
 * is non-null; `focusDocId` scrolls to and highlights a specific source
 * (e.g. after clicking an inline [n] marker).
 */
export function SourcesPanel({
  citations,
  focusDocId,
  onClose,
}: {
  citations: Citation[] | null;
  focusDocId?: string;
  onClose: () => void;
}) {
  const list = citations ? dedupeCitations(citations) : [];
  const refs = useRef<Record<string, HTMLDivElement | null>>({});

  // A document may now appear more than once (one entry per kind) — focus the
  // first entry belonging to the requested document.
  const focused = focusDocId
    ? list.find((c) => c.documentId === focusDocId)
    : undefined;
  const focusKey = focused ? citationKey(focused) : undefined;

  useEffect(() => {
    if (!citations) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // Scroll the focused source into view.
    if (focusKey) {
      requestAnimationFrame(() =>
        refs.current[focusKey]?.scrollIntoView({ block: "center", behavior: "smooth" }),
      );
    }
    return () => window.removeEventListener("keydown", onKey);
  }, [citations, focusKey, onClose]);

  return (
    <AnimatePresence>
      {citations && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <motion.div
            className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
          />
          <motion.aside
            className="relative z-10 flex h-full w-full max-w-[400px] flex-col border-l border-border bg-popover shadow-pop"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", duration: 0.35, bounce: 0.12 }}
          >
            <div className="flex h-14 items-center justify-between border-b border-border px-5">
              <h2 className="text-sm font-semibold">
                Sources <span className="text-muted-foreground">({list.length})</span>
              </h2>
              <button
                onClick={onClose}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 scroll-slim">
              {list.map((c) => {
                const key = citationKey(c);
                const meta = KIND_META[c.kind];
                return (
                  <div
                    key={key}
                    ref={(el) => {
                      refs.current[key] = el;
                    }}
                    className={cnFocus(key === focusKey)}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
                        {meta ? <meta.icon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{c.filename}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.pageNumber ? `Page ${c.pageNumber} · ` : ""}
                          {Math.round(c.score * 100)}% match
                        </p>
                      </div>
                    </div>

                    {meta && (
                      <span className="mt-2 inline-flex items-center gap-1 rounded-md border border-border bg-secondary/60 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                        <meta.icon className="h-3 w-3" />
                        {meta.label}
                      </span>
                    )}

                    {c.kind === "IMAGE" && c.imageKey && <ChunkImage chunkId={c.chunkId} />}

                    <div className="mt-2.5 rounded-lg border border-border bg-secondary/40 p-3">
                      <Quote className="mb-1.5 h-3.5 w-3.5 text-muted-foreground" />
                      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/90">
                        {c.snippet}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-border px-5 py-3">
              <p className="text-xs text-muted-foreground">
                Answers are grounded strictly in these retrieved passages.
              </p>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

/**
 * The chart or diagram an IMAGE citation was written from. The endpoint needs
 * an auth header, so the bytes are fetched into an object URL rather than set
 * as a plain src. Renders nothing if the image is gone or unreadable — the
 * description below it still stands on its own.
 */
function ChunkImage({ chunkId }: { chunkId: string }) {
  const { workspaceId } = useWorkspace();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    api.chat
      .chunkImageUrl(workspaceId, chunkId)
      .then((next) => {
        objectUrl = next;
        if (active) setUrl(next);
        else URL.revokeObjectURL(next); // unmounted while in flight
      })
      .catch(() => {
        /* image missing — the description is enough */
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [workspaceId, chunkId]);

  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="mt-2.5 block overflow-hidden rounded-lg border border-border bg-secondary/40"
    >
      {/* Object URL fetched with auth — next/image can't optimise blob: */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Source chart" className="max-h-48 w-full object-contain" />
    </a>
  );
}

function cnFocus(focused: boolean): string {
  return `rounded-xl border p-3 transition-colors ${
    focused ? "border-primary/50 bg-accent/40" : "border-border bg-card"
  }`;
}
