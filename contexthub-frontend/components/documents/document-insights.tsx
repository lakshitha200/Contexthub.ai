"use client";

import { Badge } from "@/components/ui/badge";
import { DOC_TYPE_LABELS, type DocType } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * What ingestion recorded about a document: its type, a summary, and topic
 * keywords. All three are written in one pass and any of them can be absent —
 * analysis is best-effort and never fails a document — so every part renders
 * only when it has something to show.
 */

/** The type badge, shown inline next to the filename. */
export function DocTypeBadge({ docType }: { docType: DocType | null }) {
  if (!docType) return null;
  return (
    <Badge tone="info" className="shrink-0">
      {DOC_TYPE_LABELS[docType]}
    </Badge>
  );
}

/** Clickable topic keywords. `active` marks the one currently filtering. */
export function TopicChips({
  topics,
  active,
  onSelect,
}: {
  topics: string[];
  active?: string | null;
  onSelect?: (topic: string) => void;
}) {
  if (topics.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {topics.map((topic) => (
        <button
          key={topic}
          type="button"
          onClick={onSelect ? () => onSelect(topic) : undefined}
          disabled={!onSelect}
          className={cn(
            "rounded-md px-1.5 py-0.5 text-[11px] leading-tight transition-colors",
            active === topic
              ? "bg-accent text-accent-foreground"
              : "bg-secondary text-muted-foreground",
            onSelect && "hover:bg-border hover:text-foreground",
          )}
        >
          {topic}
        </button>
      ))}
    </div>
  );
}

/**
 * The generated summary, clamped to two lines. Clamped rather than truncated
 * with JS so the full text stays selectable and available to screen readers.
 */
export function DocumentSummary({ summary }: { summary: string | null }) {
  if (!summary) return null;
  return (
    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
      {summary}
    </p>
  );
}
