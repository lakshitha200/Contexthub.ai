"use client";

import { motion } from "framer-motion";
import { FileText, Quote } from "lucide-react";
import type { Citation } from "@/lib/types";
import { Modal } from "@/components/ui/modal";

/** The "Sources" strip shown under an assistant answer. */
export function CitationsList({
  citations,
  onOpen,
}: {
  citations: Citation[];
  onOpen: (c: Citation) => void;
}) {
  if (!citations.length) return null;
  return (
    <div className="mt-3.5">
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">
        {citations.length} source{citations.length > 1 ? "s" : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        {citations.map((c, i) => (
          <motion.button
            key={c.chunkId}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.06, duration: 0.25 }}
            onClick={() => onOpen(c)}
            className="group flex max-w-[240px] items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-left shadow-soft transition-colors hover:border-primary/40"
          >
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-[5px] bg-accent text-[11px] font-semibold text-accent-foreground">
              {c.index}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium">{c.filename}</span>
              <span className="block text-[11px] text-muted-foreground">
                {c.pageNumber ? `p.${c.pageNumber} · ` : ""}
                {Math.round(c.score * 100)}% match
              </span>
            </span>
          </motion.button>
        ))}
      </div>
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
