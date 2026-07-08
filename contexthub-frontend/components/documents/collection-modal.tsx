"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import type { Collection } from "@/lib/types";

/** Create a new collection, or rename an existing one when `editing` is set. */
export function CollectionModal({
  open,
  onClose,
  workspaceId,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  editing?: Collection | null;
  onSaved: (c: Collection) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const isEdit = !!editing;

  useEffect(() => {
    if (open) setName(editing?.name ?? "");
  }, [open, editing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) return;
    setLoading(true);
    try {
      const col = isEdit
        ? await api.collections.update(workspaceId, editing!.id, trimmed)
        : await api.collections.create(workspaceId, trimmed);
      toast("success", isEdit ? "Collection renamed" : "Collection created", col.name);
      onSaved(col);
      onClose();
    } catch {
      toast("error", isEdit ? "Couldn't rename collection" : "Couldn't create collection");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Rename collection" : "New collection"}
      description={
        isEdit
          ? "Give this collection a clearer name."
          : "Collections group related documents so you can scope questions to them."
      }
    >
      <form onSubmit={submit} className="mt-4 space-y-4">
        <Field label="Name">
          <Input
            autoFocus
            placeholder="e.g. Market Research"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={loading} disabled={name.trim().length < 2}>
            {isEdit ? "Save" : "Create"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
