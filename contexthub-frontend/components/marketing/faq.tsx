"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const ITEMS = [
  {
    q: "Where do the answers come from?",
    a: "Only from the documents in your workspace. ContextHub searches your files for the passages that actually relate to your question, and the model is given those passages to answer from. Every answer lists the sources it used, so you can open them and check.",
  },
  {
    q: "What file types can I upload?",
    a: "PDF, Word, Markdown, HTML, CSV, JSON, plain text and images. Files up to 25 MB each.",
  },
  {
    q: "Can it read tables, charts and scanned pages?",
    a: "Yes. Scanned pages are read with vision, so a PDF that is really just photos of paper still becomes searchable. Charts and diagrams are described in words, and tables are kept whole rather than cut in half, because half a table answers nothing.",
  },
  {
    q: "Who can see my documents?",
    a: "Only members of the workspace the documents live in. Every query is scoped to one workspace at the database level, so a document can never surface in another team's answers. Your conversations are private to you, even inside a shared workspace.",
  },
  {
    q: "What does beta mean here?",
    a: "The product works end to end and you can use it today. It also means features are still moving, the occasional rough edge is expected, and you should treat AI answers as a starting point to verify rather than a final word. Check the citations on anything that matters.",
  },
];

export function Faq() {
  // Accordion rather than independent toggles: one open answer at a time keeps
  // the page from growing under the reader while they are mid sentence.
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {ITEMS.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q}>
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-secondary/40"
            >
              <span className="text-[15px] font-medium">{item.q}</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300",
                  isOpen && "rotate-180 text-primary",
                )}
              />
            </button>
            {/* 0fr to 1fr animates height with no measuring and no layout hacks. */}
            <div
              className="grid transition-[grid-template-rows] duration-300 ease-out"
              style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
            >
              <div className="min-h-0 overflow-hidden">
                <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">
                  {item.a}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
