"use client";

import { motion } from "framer-motion";
import { Download, FileText, FolderPlus, MoreHorizontal, RefreshCw, Trash2, Upload } from "lucide-react";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FileTypeIcon } from "@/components/documents/file-icon";
import { CreateCollectionModal } from "@/components/documents/create-collection-modal";
import { StatusBadge } from "@/components/documents/status-badge";
import { UploadModal } from "@/components/documents/upload-modal";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { ConfirmDialog, EmptyState } from "@/components/ui/misc";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useDocuments } from "@/lib/hooks/use-documents";
import { useWorkspace } from "@/lib/store/workspace-context";
import type { Document } from "@/lib/types";
import { cn, colorFromString, formatBytes, timeAgo } from "@/lib/utils";

export default function DocumentsPage() {
  return (
    <Suspense fallback={null}>
      <DocumentsView />
    </Suspense>
  );
}

function DocumentsView() {
  const { workspaceId, collections, canManage, reloadCollections } = useWorkspace();
  const search = useSearchParams();
  const toast = useToast();
  const collectionParam = search.get("collection");
  const [filter, setFilter] = useState<string | null>(collectionParam);
  const activeFilter = collectionParam ?? filter;

  const { documents, loading, addDocument, updateDocument, removeDocument } = useDocuments(
    workspaceId,
    collections,
    activeFilter,
  );

  const [uploadOpen, setUploadOpen] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Document | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function reprocess(doc: Document) {
    try {
      const updated = await api.documents.reprocess(workspaceId, doc.id);
      updateDocument(updated);
      toast("info", "Reprocessing started", doc.filename);
    } catch {
      toast("error", "Couldn't reprocess");
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.documents.remove(workspaceId, toDelete.id);
      removeDocument(toDelete.id);
      toast("success", "Document deleted");
    } catch {
      toast("error", "Couldn't delete document");
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  }

  return (
    <div className="h-full overflow-y-auto scroll-slim">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload files to make them searchable. Processing happens automatically.
            </p>
          </div>
          <div className="flex gap-2">
            {canManage && (
              <Button variant="outline" onClick={() => setCollectionOpen(true)}>
                <FolderPlus className="h-4 w-4" /> Collection
              </Button>
            )}
            <Button onClick={() => setUploadOpen(true)} disabled={collections.length === 0}>
              <Upload className="h-4 w-4" /> Upload
            </Button>
          </div>
        </div>

        {/* Collection filter */}
        {collections.length > 0 && (
          <div className="mb-5 flex flex-wrap gap-1.5">
            <FilterChip active={!activeFilter} onClick={() => setFilter(null)} label="All" />
            {collections.map((c) => (
              <FilterChip
                key={c.id}
                active={activeFilter === c.id}
                onClick={() => setFilter(c.id)}
                label={c.name}
                dot={colorFromString(c.name)}
              />
            ))}
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[68px] rounded-xl" />
            ))}
          </div>
        ) : collections.length === 0 ? (
          <EmptyState
            icon={<FolderPlus className="h-6 w-6" />}
            title="Create a collection first"
            description="Collections group your documents. Add one to start uploading."
            action={canManage && <Button onClick={() => setCollectionOpen(true)}><FolderPlus className="h-4 w-4" /> New collection</Button>}
          />
        ) : documents.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-6 w-6" />}
            title="No documents yet"
            description="Upload PDFs, Word docs, or Markdown to build your knowledge base."
            action={<Button onClick={() => setUploadOpen(true)}><Upload className="h-4 w-4" /> Upload documents</Button>}
          />
        ) : (
          <div className="space-y-2">
            {documents.map((doc, i) => {
              const collection = collections.find((c) => c.id === doc.collectionId);
              return (
                <motion.div
                  key={doc.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.3) }}
                  className="group flex items-center gap-3.5 rounded-xl border border-border bg-card p-3 shadow-soft transition-shadow hover:shadow-pop"
                >
                  <FileTypeIcon mimeType={doc.mimeType} filename={doc.filename} size={42} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{doc.filename}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                      {collection && <span>{collection.name}</span>}
                      <span>·</span>
                      <span>{formatBytes(doc.sizeBytes)}</span>
                      <span>·</span>
                      <span>{timeAgo(doc.createdAt)}</span>
                      {doc.status === "FAILED" && doc.errorMessage && (
                        <span className="text-danger">· {doc.errorMessage}</span>
                      )}
                    </div>
                  </div>
                  <StatusBadge status={doc.status} />
                  <Dropdown
                    align="end"
                    trigger={
                      <button className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-secondary hover:text-foreground group-hover:opacity-100">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    }
                  >
                    <DropdownItem icon={<Download className="h-4 w-4" />} onClick={() => window.open(api.documents.downloadUrl(workspaceId, doc.id), "_blank")}>
                      Download
                    </DropdownItem>
                    {canManage && (
                      <DropdownItem icon={<RefreshCw className="h-4 w-4" />} onClick={() => reprocess(doc)}>
                        Reprocess
                      </DropdownItem>
                    )}
                    {canManage && (
                      <DropdownItem danger icon={<Trash2 className="h-4 w-4" />} onClick={() => setToDelete(doc)}>
                        Delete
                      </DropdownItem>
                    )}
                  </Dropdown>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        collections={collections}
        defaultCollectionId={activeFilter ?? undefined}
        onUploaded={addDocument}
      />
      <CreateCollectionModal
        open={collectionOpen}
        onClose={() => setCollectionOpen(false)}
        workspaceId={workspaceId}
        onCreated={() => void reloadCollections()}
      />
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="Delete document?"
        description={`"${toDelete?.filename}" and its embeddings will be permanently removed.`}
        confirmLabel="Delete"
        danger
        loading={deleting}
      />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  dot,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  dot?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active ? "border-primary/40 bg-accent text-accent-foreground" : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      {dot && <span className="h-2 w-2 rounded-full" style={{ background: dot }} />}
      {label}
    </button>
  );
}
