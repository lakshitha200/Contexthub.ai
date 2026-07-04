"use client";

import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { DocStatus } from "@/lib/types";

const LABELS: Record<DocStatus, string> = {
  UPLOADED: "Queued",
  PARSING: "Parsing",
  CHUNKING: "Chunking",
  EMBEDDING: "Embedding",
  READY: "Ready",
  FAILED: "Failed",
};

/** Ordered pipeline (excludes terminal FAILED). Used for the progress hint. */
const STEP: DocStatus[] = ["UPLOADED", "PARSING", "CHUNKING", "EMBEDDING", "READY"];

export function StatusBadge({ status }: { status: DocStatus }) {
  if (status === "READY") {
    return (
      <Badge tone="success">
        <CheckCircle2 className="h-3.5 w-3.5" /> Ready
      </Badge>
    );
  }
  if (status === "FAILED") {
    return (
      <Badge tone="danger">
        <AlertTriangle className="h-3.5 w-3.5" /> Failed
      </Badge>
    );
  }
  const pct = Math.round(((STEP.indexOf(status) + 1) / STEP.length) * 100);
  return (
    <Badge tone="warning">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      {LABELS[status]} · {pct}%
    </Badge>
  );
}
