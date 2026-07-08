"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { DOC_TERMINAL, type Collection, type Document } from "@/lib/types";

/**
 * Loads documents for a workspace (optionally filtered to one collection) and
 * live-polls any that are still processing until they reach a terminal status.
 */
export function useDocuments(
  workspaceId: string,
  collections: Collection[],
  collectionId: string | null,
) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    const targets = collectionId ? [collectionId] : collections.map((c) => c.id);
    const results = await Promise.all(targets.map((cid) => api.documents.list(workspaceId, cid)));
    const merged = results.flat().sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    setDocuments(merged);
    setLoading(false);
  }, [workspaceId, collectionId, collections]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  // Poll processing documents.
  useEffect(() => {
    const processing = documents.filter((d) => !DOC_TERMINAL.includes(d.status));
    if (processing.length === 0) {
      if (pollRef.current) {
        window.clearTimeout(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    pollRef.current = window.setTimeout(async () => {
      const updates = await Promise.all(
        processing.map((d) =>
          api.documents.get(workspaceId, d.collectionId, d.id).catch(() => d),
        ),
      );
      setDocuments((prev) => prev.map((d) => updates.find((u) => u.id === d.id) ?? d));
    }, 2200);
    return () => {
      if (pollRef.current) window.clearTimeout(pollRef.current);
    };
  }, [documents, workspaceId]);

  const addDocument = (doc: Document) => setDocuments((prev) => [doc, ...prev]);
  const updateDocument = (doc: Document) =>
    setDocuments((prev) => prev.map((d) => (d.id === doc.id ? doc : d)));
  const removeDocument = (id: string) => setDocuments((prev) => prev.filter((d) => d.id !== id));

  return { documents, loading, reload: load, addDocument, updateDocument, removeDocument };
}
