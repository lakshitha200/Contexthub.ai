"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Loader2, UploadCloud, X } from "lucide-react";
import { useRef, useState } from "react";
import { FileTypeIcon } from "@/components/documents/file-icon";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/store/workspace-context";
import type { Collection, Document } from "@/lib/types";
import { cn, colorFromString, formatBytes } from "@/lib/utils";

export function UploadModal({
  open,
  onClose,
  collections,
  defaultCollectionId,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  collections: Collection[];
  defaultCollectionId?: string;
  onUploaded: (doc: Document) => void;
}) {
  const { workspaceId } = useWorkspace();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [collectionId, setCollectionId] = useState(defaultCollectionId ?? collections[0]?.id ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((f) => [...f, ...Array.from(list)]);
  }

  async function submit() {
    if (!collectionId || files.length === 0) return;
    setUploading(true);
    let ok = 0;
    for (const file of files) {
      try {
        const doc = await api.documents.upload(workspaceId, collectionId, file);
        onUploaded(doc);
        ok++;
      } catch {
        toast("error", `Failed to upload ${file.name}`);
      }
    }
    setUploading(false);
    if (ok) toast("success", `${ok} file${ok > 1 ? "s" : ""} uploaded`, "Processing started.");
    setFiles([]);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Upload documents" description="PDF, Word, Markdown, or spreadsheets. They'll be parsed and embedded automatically." className="max-w-lg">
      <div className="mt-4 space-y-4">
        {collections.length > 1 && (
          <div>
            <p className="mb-1.5 text-[13px] font-medium">Collection</p>
            <div className="flex flex-wrap gap-1.5">
              {collections.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCollectionId(c.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                    collectionId === c.id ? "border-primary/50 bg-accent text-accent-foreground" : "border-border hover:bg-secondary",
                  )}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: colorFromString(c.name) }} />
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
            dragging ? "border-primary bg-accent/50" : "border-border hover:border-primary/40 hover:bg-secondary/40",
          )}
        >
          <UploadCloud className={cn("mb-3 h-8 w-8", dragging ? "text-primary" : "text-muted-foreground")} />
          <p className="text-sm font-medium">Drop files here, or click to browse</p>
          <p className="mt-1 text-xs text-muted-foreground">Up to 25 MB each</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => addFiles(e.target.files)}
            accept=".pdf,.doc,.docx,.md,.markdown,.txt,.csv,.xlsx"
          />
        </div>

        <AnimatePresence>
          {files.length > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-1.5 overflow-hidden">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-card p-2">
                  <FileTypeIcon mimeType={f.type} filename={f.name} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{f.name}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(f.size)}</p>
                  </div>
                  <button onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={uploading}>Cancel</Button>
          <Button onClick={submit} disabled={!collectionId || files.length === 0 || uploading}>
            {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
            Upload {files.length > 0 ? `(${files.length})` : ""}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
