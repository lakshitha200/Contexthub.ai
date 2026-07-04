"use client";

import { LogOut, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/store/workspace-context";

export default function WorkspaceSettingsPage() {
  const router = useRouter();
  const toast = useToast();
  const { workspaceId, workspace, role, reloadWorkspace } = useWorkspace();
  const isOwner = role === "OWNER";

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<"delete" | "leave" | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (workspace) {
      setName(workspace.name);
      setDescription(workspace.description ?? "");
    }
  }, [workspace]);

  const dirty = workspace && (name !== workspace.name || description !== (workspace.description ?? ""));

  async function save() {
    setSaving(true);
    try {
      await api.workspaces.update(workspaceId, { name: name.trim(), description: description.trim() });
      await reloadWorkspace();
      toast("success", "Workspace updated");
    } catch {
      toast("error", "Couldn't save changes");
    } finally {
      setSaving(false);
    }
  }

  async function runDestructive() {
    setWorking(true);
    try {
      if (confirm === "delete") await api.workspaces.remove(workspaceId);
      else await api.workspaces.leave(workspaceId);
      toast("success", confirm === "delete" ? "Workspace deleted" : "You left the workspace");
      router.replace("/workspaces");
    } catch {
      toast("error", "Something went wrong");
    } finally {
      setWorking(false);
      setConfirm(null);
    }
  }

  return (
    <div className="h-full overflow-y-auto scroll-slim">
      <div className="mx-auto max-w-2xl px-6 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Workspace settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage this workspace&apos;s details.</p>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>General</CardTitle>
            <CardDescription>Visible to everyone in the workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!isOwner} maxLength={80} />
            </Field>
            <Field label="Description">
              <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} disabled={!isOwner} maxLength={500} />
            </Field>
            {isOwner && (
              <div className="flex justify-end">
                <Button onClick={save} loading={saving} disabled={!dirty || name.trim().length < 2}>
                  Save changes
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-6 border-danger/30">
          <CardHeader>
            <CardTitle className="text-danger">Danger zone</CardTitle>
            <CardDescription>These actions can&apos;t be undone.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setConfirm("leave")}>
              <LogOut className="h-4 w-4" /> Leave workspace
            </Button>
            {isOwner && (
              <Button variant="danger" onClick={() => setConfirm("delete")}>
                <Trash2 className="h-4 w-4" /> Delete workspace
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={runDestructive}
        title={confirm === "delete" ? "Delete workspace?" : "Leave workspace?"}
        description={
          confirm === "delete"
            ? "All collections, documents and chats will be permanently deleted."
            : "You'll lose access until you're invited again."
        }
        confirmLabel={confirm === "delete" ? "Delete" : "Leave"}
        danger
        loading={working}
      />
    </div>
  );
}
