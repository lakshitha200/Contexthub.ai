"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export function InviteModal({
  open,
  onClose,
  workspaceId,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  onInvited: () => void;
}) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) return;
    setLoading(true);
    try {
      await api.workspaces.invite(workspaceId, { email, role });
      toast("success", "Invite sent", email);
      onInvited();
      setEmail("");
      onClose();
    } catch {
      toast("error", "Couldn't send invite");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Invite member" description="They'll get access to this workspace's documents and chats.">
      <form onSubmit={submit} className="mt-4 space-y-4">
        <Field label="Email">
          <Input autoFocus type="email" placeholder="teammate@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <div>
          <p className="mb-1.5 text-[13px] font-medium">Role</p>
          <div className="grid grid-cols-2 gap-2">
            {(["MEMBER", "ADMIN"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  role === r ? "border-primary/50 bg-accent" : "border-border hover:bg-secondary",
                )}
              >
                <p className="text-sm font-medium capitalize">{r.toLowerCase()}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {r === "ADMIN" ? "Manage docs & members" : "Read & chat access"}
                </p>
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading} disabled={!email.includes("@")}>Send invite</Button>
        </div>
      </form>
    </Modal>
  );
}
