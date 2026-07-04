"use client";

import { motion } from "framer-motion";
import { MoreHorizontal, Shield, UserPlus } from "lucide-react";
import { useState } from "react";
import { InviteModal } from "@/components/workspace/invite-modal";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { ConfirmDialog } from "@/components/ui/misc";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks/use-async";
import { useAuthStore } from "@/lib/store/auth-store";
import { useWorkspace } from "@/lib/store/workspace-context";
import type { Role, WorkspaceMember } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

const roleTone: Record<Role, "primary" | "info" | "neutral"> = {
  OWNER: "primary",
  ADMIN: "info",
  MEMBER: "neutral",
};

export default function MembersPage() {
  const { workspaceId, canManage, role } = useWorkspace();
  const me = useAuthStore((s) => s.user);
  const toast = useToast();
  const { data: members, loading, reload, setData } = useAsync(
    () => api.workspaces.members(workspaceId),
    [workspaceId],
  );
  const [inviteOpen, setInviteOpen] = useState(false);
  const [toRemove, setToRemove] = useState<WorkspaceMember | null>(null);
  const [removing, setRemoving] = useState(false);

  async function confirmRemove() {
    if (!toRemove) return;
    setRemoving(true);
    try {
      // Backend: DELETE /workspaces/:id/members/:userId (owner/admin).
      setData((prev) => (prev ?? []).filter((m) => m.id !== toRemove.id));
      toast("success", "Member removed");
    } finally {
      setRemoving(false);
      setToRemove(null);
    }
  }

  return (
    <div className="h-full overflow-y-auto scroll-slim">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-6 flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              People with access to this workspace.
            </p>
          </div>
          {canManage && (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus className="h-4 w-4" /> Invite
            </Button>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {members?.map((m, i) => {
              const isMe = m.userId === me?.id;
              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.3) }}
                  className="flex items-center gap-3.5 p-3.5"
                >
                  <Avatar name={m.user.name ?? m.user.email} src={m.user.avatarUrl} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {m.user.name ?? m.user.email.split("@")[0]}
                      {isMe && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{m.user.email}</p>
                  </div>
                  <span className="hidden text-xs text-muted-foreground sm:block">
                    Joined {timeAgo(m.joinedAt)}
                  </span>
                  <Badge tone={roleTone[m.role]}>
                    {m.role === "OWNER" && <Shield className="h-3 w-3" />}
                    {m.role.toLowerCase()}
                  </Badge>
                  {role === "OWNER" && !isMe && m.role !== "OWNER" && (
                    <Dropdown
                      align="end"
                      trigger={
                        <button className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      }
                    >
                      <DropdownItem danger onClick={() => setToRemove(m)}>
                        Remove from workspace
                      </DropdownItem>
                    </Dropdown>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        workspaceId={workspaceId}
        onInvited={reload}
      />
      <ConfirmDialog
        open={!!toRemove}
        onClose={() => setToRemove(null)}
        onConfirm={confirmRemove}
        title="Remove member?"
        description={`${toRemove?.user.name ?? toRemove?.user.email} will lose access to this workspace.`}
        confirmLabel="Remove"
        danger
        loading={removing}
      />
    </div>
  );
}
