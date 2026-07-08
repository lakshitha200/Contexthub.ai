"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import type { Workspace } from "@/lib/types";

export function CreateWorkspaceModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (ws: Workspace) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return;
    setLoading(true);
    try {
      const ws = await api.workspaces.create({ name: name.trim(), description: description.trim() || undefined });
      toast("success", "Workspace created", ws.name);
      onCreated(ws);
      setName("");
      setDescription("");
      onClose();
    } catch {
      toast("error", "Couldn't create workspace");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create workspace" description="A workspace groups your collections, documents and chats.">
      <form onSubmit={submit} className="mt-4 space-y-4">
        <Field label="Name">
          <Input autoFocus placeholder="Acme Research" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Description" hint="Optional">
          <Textarea rows={3} placeholder="What lives in this workspace?" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading} disabled={name.trim().length < 2}>Create workspace</Button>
        </div>
      </form>
    </Modal>
  );
}
