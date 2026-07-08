"use client";

import { Fragment } from "react";
import type { Citation } from "@/lib/types";

/**
 * Minimal, dependency-free renderer for assistant text. Handles **bold**,
 * line breaks, simple numbered/bullet lines, and inline [n] citation markers
 * which become clickable chips.
 */
export function MessageContent({
  content,
  citations,
  onCite,
}: {
  content: string;
  citations?: Citation[] | null;
  onCite?: (c: Citation) => void;
}) {
  const lines = content.split("\n");
  return (
    <div className="space-y-2 text-[15px] leading-relaxed">
      {lines.map((line, i) => {
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return (
          <p key={i} className="[&:not(:first-child)]:mt-0">
            {renderInline(line, citations ?? [], onCite)}
          </p>
        );
      })}
    </div>
  );
}

function renderInline(
  text: string,
  citations: Citation[],
  onCite?: (c: Citation) => void,
): React.ReactNode {
  // Split on **bold** and [n] citation markers, keeping delimiters.
  const parts = text.split(/(\*\*[^*]+\*\*|\[\d+\])/g).filter(Boolean);
  return parts.map((part, i) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) return <strong key={i} className="font-semibold">{bold[1]}</strong>;

    const cite = part.match(/^\[(\d+)\]$/);
    if (cite) {
      const idx = Number(cite[1]);
      const citation = citations.find((c) => c.index === idx);
      if (citation) {
        return (
          <button
            key={i}
            onClick={() => onCite?.(citation)}
            title={citation.filename}
            className="mx-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] bg-accent px-1 align-[1px] text-[11px] font-semibold text-accent-foreground transition-colors hover:brightness-95"
          >
            {idx}
          </button>
        );
      }
      return <Fragment key={i}>{part}</Fragment>;
    }

    return <Fragment key={i}>{part}</Fragment>;
  });
}
