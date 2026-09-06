"use client";

import { motion } from "framer-motion";
import {
  Download,
  FileText,
  Files,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CollectionModal } from "@/components/documents/collection-modal";
import {
  DocTypeBadge,
  DocumentSummary,
  TopicChips,
} from "@/components/documents/document-insights";
import { FileTypeIcon } from "@/components/documents/file-icon";
import { StatusBadge } from "@/components/documents/status-badge";
import { UploadModal } from "@/components/documents/upload-modal";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { ConfirmDialog, EmptyState } from "@/components/ui/misc";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useDocuments } from "@/lib/hooks/use-documents";
import { useAuthStore } from "@/lib/store/auth-store";
import { useWorkspace } from "@/lib/store/workspace-context";
import {
  DOC_TYPE_LABELS,
  type Collection,
  type DocType,
  type Document,
} from "@/lib/types";
import { cn, colorFromString, formatBytes, timeAgo } from "@/lib/utils";

/** Topic chips beyond this are hidden — a long tail is noise, not a filter. */
const MAX_TOPIC_FACETS = 12;

export default function DocumentsPage() {
  return (
    <Suspense fallback={null}>
      <DocumentsView />
    </Suspense>
  );
}

function DocumentsView() {
  const { workspaceId, collections, canManage, reloadCollections, upsertCollection } = useWorkspace();
  const me = useAuthStore((s) => s.user);
  const search = useSearchParams();
  const toast = useToast();
  const collectionParam = search.get("collection");

  // Selected collection (null = All). Auto-selects the sole collection, and
  // follows the sidebar's ?collection= links.
  const [selected, setSelected] = useState<string | null>(collectionParam);
  useEffect(() => {
    if (collectionParam) setSelected(collectionParam);
    else if (collections.length === 1) setSelected(collections[0].id);
  }, [collectionParam, collections]);

  const { documents, loading, addDocument, updateDocument, removeDocument } = useDocuments(
    workspaceId,
    collections,
    selected,
  );

  const [uploadOpen, setUploadOpen] = useState(false);
  const [colModalOpen, setColModalOpen] = useState(false);
  const [editingCol, setEditingCol] = useState<Collection | null>(null);
  const [toDelete, setToDelete] = useState<Document | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [colToDelete, setColToDelete] = useState<Collection | null>(null);
  const [colDeleting, setColDeleting] = useState(false);

  // Filters on what ingestion recorded about each document. Applied client-side:
  // the list is already loaded, so a chip should filter instantly rather than
  // wait on a round trip. (The API supports ?docType= / ?topic= for consumers
  // that aren't holding the full list.)
  const [typeFilter, setTypeFilter] = useState<DocType | null>(null);
  const [topicFilter, setTopicFilter] = useState<string | null>(null);

  const activeCollection = collections.find((c) => c.id === selected) ?? null;
  const totalDocs = collections.reduce((n, c) => n + (c.documentCount ?? 0), 0);

  // Switching collections changes the population the facets came from, so a
  // filter carried over would silently hide everything. Adjusted during render
  // rather than in an effect — React's documented pattern for resetting state
  // when the value it depends on changes, and it avoids a wasted second pass.
  const [facetSource, setFacetSource] = useState(selected);
  if (facetSource !== selected) {
    setFacetSource(selected);
    setTypeFilter(null);
    setTopicFilter(null);
  }

  const typeFacets = countBy(documents, (d) => (d.docType ? [d.docType] : []));
  const topicFacets = countBy(documents, (d) => d.topics ?? []).slice(
    0,
    MAX_TOPIC_FACETS,
  );

  const visible = documents.filter(
    (d) =>
      (!typeFilter || d.docType === typeFilter) &&
      (!topicFilter || (d.topics ?? []).includes(topicFilter)),
  );
  const filtered = Boolean(typeFilter || topicFilter);

  function toggleTopic(topic: string) {
    setTopicFilter((current) => (current === topic ? null : topic));
  }

  function openNewCollection() {
    setEditingCol(null);
    setColModalOpen(true);
  }
  function openRenameCollection(c: Collection) {
    setEditingCol(c);
    setColModalOpen(true);
  }

  async function reprocess(doc: Document) {
    try {
      await api.documents.reprocess(workspaceId, doc.collectionId, doc.id);
      updateDocument({ ...doc, status: "UPLOADED", errorMessage: null });
      toast("info", "Reprocessing started", doc.filename);
    } catch {
      toast("error", "Couldn't reprocess");
    }
  }

  async function download(doc: Document) {
    try {
      await api.documents.download(workspaceId, doc.collectionId, doc.id, doc.filename);
    } catch {
      toast("error", "Couldn't download file");
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.documents.remove(workspaceId, toDelete.collectionId, toDelete.id);
      removeDocument(toDelete.id);
      toast("success", "Document deleted");
    } catch {
      toast("error", "Couldn't delete document");
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  }

  async function confirmDeleteCollection() {
    if (!colToDelete) return;
    setColDeleting(true);
    try {
      await api.collections.remove(workspaceId, colToDelete.id);
      if (selected === colToDelete.id) setSelected(null);
      await reloadCollections();
      toast("success", "Collection deleted");
    } catch {
      toast("error", "Couldn't delete collection");
    } finally {
      setColDeleting(false);
      setColToDelete(null);
    }
  }

  return (
    <div className="flex h-full">
      {/* Collections panel (desktop) */}
      <aside className="hidden w-[240px] shrink-0 flex-col border-r border-border md:flex">
        <div className="flex h-14 items-center justify-between px-4">
          <span className="text-sm font-semibold">Collections</span>
          {canManage && (
            <button
              onClick={openNewCollection}
              title="New collection"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 scroll-slim">
          <CollectionRow
            label="All documents"
            count={totalDocs}
            active={!selected}
            onClick={() => setSelected(null)}
            leading={<Files className="h-4 w-4 text-muted-foreground" />}
          />
          {collections.map((c) => (
            <CollectionRow
              key={c.id}
              label={c.name}
              count={c.documentCount}
              active={selected === c.id}
              onClick={() => setSelected(c.id)}
              leading={<span className="h-2.5 w-2.5 rounded-full" style={{ background: colorFromString(c.name) }} />}
              menu={
                canManage ? (
                  <Dropdown
                    align="end"
                    trigger={
                      <button className="hidden rounded-md p-1 text-muted-foreground hover:bg-border hover:text-foreground group-hover:block">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    }
                  >
                    <DropdownItem icon={<Pencil className="h-4 w-4" />} onClick={() => openRenameCollection(c)}>
                      Rename
                    </DropdownItem>
                    <DropdownItem danger icon={<Trash2 className="h-4 w-4" />} onClick={() => setColToDelete(c)}>
                      Delete
                    </DropdownItem>
                  </Dropdown>
                ) : undefined
              }
            />
          ))}
          {collections.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">No collections yet</p>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="min-w-0 flex-1 overflow-y-auto scroll-slim">
        <div className="mx-auto max-w-3xl px-6 py-8">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {activeCollection ? activeCollection.name : "All documents"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {loading
                  ? "Loading…"
                  : filtered
                    ? `${visible.length} of ${documents.length} document${documents.length === 1 ? "" : "s"}`
                    : `${documents.length} document${documents.length === 1 ? "" : "s"}`}
                {" · Processing happens automatically."}
              </p>
            </div>
            <Button onClick={() => setUploadOpen(true)} disabled={collections.length === 0}>
              <Upload className="h-4 w-4" /> Upload
            </Button>
          </div>

          {/* Mobile collection chips */}
          {collections.length > 0 && (
            <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1 md:hidden">
              <Chip active={!selected} onClick={() => setSelected(null)} label="All" />
              {collections.map((c) => (
                <Chip
                  key={c.id}
                  active={selected === c.id}
                  onClick={() => setSelected(c.id)}
                  label={c.name}
                  dot={colorFromString(c.name)}
                />
              ))}
              {canManage && (
                <button
                  onClick={openNewCollection}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground"
                >
                  <Plus className="h-3.5 w-3.5" /> New
                </button>
              )}
            </div>
          )}

          {/* Facets from what ingestion recorded. Absent until documents are
              analyzed, so the bar simply doesn't render on a fresh workspace. */}
          {!loading && (typeFacets.length > 0 || topicFacets.length > 0) && (
            <div className="mb-5 space-y-2">
              {typeFacets.length > 0 && (
                <FacetRow label="Type">
                  {typeFacets.map(({ value, count }) => (
                    <Chip
                      key={value}
                      active={typeFilter === value}
                      onClick={() =>
                        setTypeFilter((current) =>
                          current === value ? null : (value as DocType),
                        )
                      }
                      label={`${DOC_TYPE_LABELS[value as DocType]} ${count}`}
                    />
                  ))}
                </FacetRow>
              )}
              {topicFacets.length > 0 && (
                <FacetRow label="Topic">
                  {topicFacets.map(({ value }) => (
                    <Chip
                      key={value}
                      active={topicFilter === value}
                      onClick={() => toggleTopic(value)}
                      label={value}
                    />
                  ))}
                </FacetRow>
              )}
              {filtered && (
                <button
                  onClick={() => {
                    setTypeFilter(null);
                    setTopicFilter(null);
                  }}
                  className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          {/* Document list */}
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
              action={canManage && <Button onClick={openNewCollection}><FolderPlus className="h-4 w-4" /> New collection</Button>}
            />
          ) : documents.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-6 w-6" />}
              title="No documents yet"
              description="Upload PDFs, Word docs, or Markdown to build your knowledge base."
              action={<Button onClick={() => setUploadOpen(true)}><Upload className="h-4 w-4" /> Upload documents</Button>}
            />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-6 w-6" />}
              title="No documents match"
              description="No document here carries that type or topic."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setTypeFilter(null);
                    setTopicFilter(null);
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <div className="space-y-2">
              {visible.map((doc, i) => {
                const collection = collections.find((c) => c.id === doc.collectionId);
                return (
                  <motion.div
                    key={doc.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.3) }}
                    className="group flex items-start gap-3.5 rounded-xl border border-border bg-card p-3 shadow-soft transition-shadow hover:shadow-pop"
                  >
                    <FileTypeIcon mimeType={doc.mimeType} filename={doc.filename} size={42} />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-sm font-medium">{doc.filename}</p>
                        <DocTypeBadge docType={doc.docType} />
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                        {!activeCollection && collection && <span>{collection.name}</span>}
                        {!activeCollection && collection && <span>·</span>}
                        <span>{formatBytes(doc.sizeBytes)}</span>
                        <span>·</span>
                        <span>
                          {timeAgo(doc.createdAt)}
                          {doc.uploader &&
                            ` by ${
                              doc.uploader.id === me?.id
                                ? "you"
                                : doc.uploader.name ?? doc.uploader.email
                            }`}
                        </span>
                        {doc.status === "FAILED" && doc.errorMessage && (
                          <span className="text-danger">· {doc.errorMessage}</span>
                        )}
                      </div>
                      <DocumentSummary summary={doc.summary} />
                      <TopicChips
                        topics={doc.topics ?? []}
                        active={topicFilter}
                        onSelect={toggleTopic}
                      />
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
                      <DropdownItem icon={<Download className="h-4 w-4" />} onClick={() => download(doc)}>
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
      </div>

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        collections={collections}
        defaultCollectionId={selected ?? undefined}
        onUploaded={addDocument}
      />
      <CollectionModal
        open={colModalOpen}
        onClose={() => setColModalOpen(false)}
        workspaceId={workspaceId}
        editing={editingCol}
        onSaved={(col) => {
          upsertCollection(col); // instant — Upload enables right away
          if (!editingCol) setSelected(col.id); // auto-select a newly created one
          void reloadCollections(); // reconcile counts in the background
        }}
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
      <ConfirmDialog
        open={!!colToDelete}
        onClose={() => setColToDelete(null)}
        onConfirm={confirmDeleteCollection}
        title="Delete collection?"
        description={`"${colToDelete?.name}" and all ${colToDelete?.documentCount ?? 0} document(s) inside it will be permanently deleted.`}
        confirmLabel="Delete collection"
        danger
        loading={colDeleting}
      />
    </div>
  );
}

/**
 * Tally a repeated field across the loaded documents, most common first, so the
 * filter bar only ever offers values that would actually match something.
 */
function countBy(
  documents: Document[],
  pick: (doc: Document) => string[],
): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  for (const doc of documents) {
    for (const value of pick(doc)) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function FacetRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-1.5 w-11 shrink-0 text-xs text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function CollectionRow({
  label,
  count,
  active,
  onClick,
  leading,
  menu,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  leading: React.ReactNode;
  menu?: React.ReactNode;
}) {
  // Laid out as flex (not an absolute/transform overlay) so the dropdown's
  // z-index isn't trapped in a transformed stacking context — otherwise the
  // open menu paints beneath the next row.
  return (
    <div
      className={cn(
        "group flex items-center gap-2.5 rounded-lg pr-1.5 text-sm transition-colors",
        active ? "bg-secondary text-foreground" : "text-foreground/80 hover:bg-secondary/60",
      )}
    >
      <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2.5 py-2 pl-3 text-left">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">{leading}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </button>
      {typeof count === "number" && (
        <span className={cn("shrink-0 text-xs text-muted-foreground", menu && "group-hover:hidden")}>
          {count}
        </span>
      )}
      {menu}
    </div>
  );
}

function Chip({
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
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active ? "border-primary/40 bg-accent text-accent-foreground" : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      {dot && <span className="h-2 w-2 rounded-full" style={{ background: dot }} />}
      {label}
    </button>
  );
}
