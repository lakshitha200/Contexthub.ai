"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, FileText, Quote, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Citation } from "@/lib/types";

/** Collapse passages from the same document into one source entry. */
export function dedupeCitations(citations: Citation[]): Citation[] {
  const byDoc = new Map<string, Citation>();
  for (const c of citations) {
    const existing = byDoc.get(c.documentId);
    if (!existing || c.score > existing.score) byDoc.set(c.documentId, c);
  }
  return [...byDoc.values()];
}

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
      className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-2.5 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:border-primary/40 hover:bg-secondary"
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

  useEffect(() => {
    if (!citations) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // Scroll the focused source into view.
    if (focusDocId) {
      requestAnimationFrame(() =>
        refs.current[focusDocId]?.scrollIntoView({ block: "center", behavior: "smooth" }),
      );
    }
    return () => window.removeEventListener("keydown", onKey);
  }, [citations, focusDocId, onClose]);

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
              {list.map((c) => (
                <div
                  key={c.documentId}
                  ref={(el) => {
                    refs.current[c.documentId] = el;
                  }}
                  className={cnFocus(c.documentId === focusDocId)}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
                      <FileText className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{c.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.pageNumber ? `Page ${c.pageNumber} · ` : ""}
                        {Math.round(c.score * 100)}% match
                      </p>
                    </div>
                  </div>
                  <div className="mt-2.5 rounded-lg border border-border bg-secondary/40 p-3">
                    <Quote className="mb-1.5 h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-[13px] leading-relaxed text-foreground/90">{c.snippet}</p>
                  </div>
                </div>
              ))}
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

function cnFocus(focused: boolean): string {
  return `rounded-xl border p-3 transition-colors ${
    focused ? "border-primary/50 bg-accent/40" : "border-border bg-card"
  }`;
}
