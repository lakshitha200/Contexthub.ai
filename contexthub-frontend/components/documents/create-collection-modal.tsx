"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import type { Collection } from "@/lib/types";

export function CreateCollectionModal({
  open,
  onClose,
  workspaceId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  onCreated: (c: Collection) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return;
    setLoading(true);
    try {
      const col = await api.collections.create(workspaceId, name.trim());
      toast("success", "Collection created", col.name);
      onCreated(col);
      setName("");
      onClose();
    } catch {
      toast("error", "Couldn't create collection");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New collection" description="Collections group related documents so you can scope questions to them.">
      <form onSubmit={submit} className="mt-4 space-y-4">
        <Field label="Name">
          <Input autoFocus placeholder="e.g. Market Research" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading} disabled={name.trim().length < 2}>Create</Button>
        </div>
      </form>
    </Modal>
  );
}
