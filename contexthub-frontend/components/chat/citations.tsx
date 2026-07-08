"use client";

import { motion } from "framer-motion";
import { FileText, Quote } from "lucide-react";
import type { Citation } from "@/lib/types";
import { Modal } from "@/components/ui/modal";

/**
 * The "Sources" strip shown under an assistant answer. De-duplicated by
 * document (the same file can back several passages) and kept compact, so it
 * reads like a source list rather than a wall of cards.
 */
export function CitationsList({
  citations,
  onOpen,
}: {
  citations: Citation[];
  onOpen: (c: Citation) => void;
}) {
  if (!citations.length) return null;

  // One chip per source document — keep the highest-scoring passage as its rep.
  const byDoc = new Map<string, Citation>();
  for (const c of citations) {
    const existing = byDoc.get(c.documentId);
    if (!existing || c.score > existing.score) byDoc.set(c.documentId, c);
  }
  const unique = [...byDoc.values()];

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2.5">
      <span className="mr-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Sources
      </span>
      {unique.map((c, i) => (
        <motion.button
          key={c.documentId}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 + i * 0.05, duration: 0.2 }}
          onClick={() => onOpen(c)}
          title={`${c.filename} · ${Math.round(c.score * 100)}% match`}
          className="group inline-flex max-w-[200px] items-center gap-1.5 rounded-md border border-border bg-secondary/50 px-2 py-1 text-xs text-foreground/80 transition-colors hover:border-primary/40 hover:bg-secondary"
        >
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{c.filename}</span>
        </motion.button>
      ))}
    </div>
  );
}

/** Detail modal for a single citation snippet. */
export function CitationModal({
  citation,
  onClose,
}: {
  citation: Citation | null;
  onClose: () => void;
}) {
  return (
    <Modal open={!!citation} onClose={onClose} className="max-w-lg">
      {citation && (
        <div>
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
              <FileText className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold">{citation.filename}</p>
              <p className="text-xs text-muted-foreground">
                Source [{citation.index}]
                {citation.pageNumber ? ` · page ${citation.pageNumber}` : ""} ·{" "}
                {Math.round(citation.score * 100)}% relevance
              </p>
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-border bg-secondary/40 p-4">
            <Quote className="mb-2 h-4 w-4 text-muted-foreground" />
            <p className="text-sm leading-relaxed text-foreground/90">{citation.snippet}</p>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            This passage was retrieved from your documents and used to ground the answer.
          </p>
        </div>
      )}
    </Modal>
  );
}
