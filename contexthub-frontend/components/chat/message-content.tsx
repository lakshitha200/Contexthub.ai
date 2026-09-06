"use client";

import { Fragment } from "react";

/**
 * Minimal, dependency-free renderer for assistant text. Handles **bold** and
 * line breaks. Inline [n] citation markers are stripped from the visible text —
 * sources live in the "N sources" panel instead, so the answer reads cleanly.
 */
export function MessageContent({ content }: { content: string }) {
  // Remove citation markers (and any space before them): "…quickly [1]." → "…quickly."
  const cleaned = content.replace(/[ \t]?\[\d+\]/g, "");
  const lines = cleaned.split("\n");

  return (
    <div className="space-y-2 text-[15px] leading-relaxed">
      {lines.map((line, i) => {
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return <p key={i}>{renderBold(line)}</p>;
      })}
    </div>
  );
}

function renderBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, i) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) return <strong key={i} className="font-semibold">{bold[1]}</strong>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}
