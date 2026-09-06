"use client";

import { motion } from "framer-motion";
import { Clock, Mail, MoreHorizontal, RotateCw, Search, Shield, UserPlus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { InviteModal } from "@/components/workspace/invite-modal";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/misc";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks/use-async";
import { useAuthStore } from "@/lib/store/auth-store";
import { useWorkspace } from "@/lib/store/workspace-context";
import type { Invite, Role, WorkspaceMember } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

const roleTone: Record<Role, "primary" | "info" | "neutral"> = {
  OWNER: "primary",
  ADMIN: "info",
  MEMBER: "neutral",
};

type RoleFilter = "ALL" | Role;

export default function MembersPage() {
  const { workspaceId, canManage, role } = useWorkspace();
  const me = useAuthStore((s) => s.user);
  const toast = useToast();

  const { data: members, loading, reload, setData } = useAsync(
    () => api.workspaces.members(workspaceId),
    [workspaceId],
  );
  // Invites are OWNER/ADMIN-only; skip the call for regular members.
  const {
    data: invites,
    reload: reloadInvites,
    setData: setInvites,
  } = useAsync<Invite[]>(
    () => (canManage ? api.workspaces.listInvites(workspaceId) : Promise.resolve([])),
    [workspaceId, canManage],
  );

  const [inviteOpen, setInviteOpen] = useState(false);
  const [toRemove, setToRemove] = useState<WorkspaceMember | null>(null);
  const [removing, setRemoving] = useState(false);
  const [busyInvite, setBusyInvite] = useState<string>();

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");

  const match = (text: string) => text.toLowerCase().includes(query.trim().toLowerCase());

  const filteredMembers = useMemo(
    () =>
      (members ?? []).filter(
        (m) =>
          (roleFilter === "ALL" || m.role === roleFilter) &&
          (match(m.user.email) || match(m.user.name ?? "")),
      ),
    [members, roleFilter, query],
  );
  const filteredInvites = useMemo(
    () =>
      (invites ?? []).filter(
        (i) => (roleFilter === "ALL" || i.role === roleFilter) && match(i.email),
      ),
    [invites, roleFilter, query],
  );

  async function confirmRemove() {
    if (!toRemove) return;
    setRemoving(true);
    try {
      await api.workspaces.removeMember(workspaceId, toRemove.userId);
      setData((prev) => (prev ?? []).filter((m) => m.id !== toRemove.id));
      toast("success", "Member removed");
    } catch {
      toast("error", "Couldn't remove member");
    } finally {
      setRemoving(false);
      setToRemove(null);
    }
  }

  async function resendInvite(invite: Invite) {
    setBusyInvite(invite.id);
    try {
      // Re-inviting the same email regenerates the token + expiry (upsert).
      await api.workspaces.invite(workspaceId, {
        email: invite.email,
        role: invite.role === "OWNER" ? "ADMIN" : invite.role,
      });
      await reloadInvites();
      toast("success", "Invitation resent", invite.email);
    } catch {
      toast("error", "Couldn't resend invite");
    } finally {
      setBusyInvite(undefined);
    }
  }

  async function cancelInvite(invite: Invite) {
    setBusyInvite(invite.id);
    try {
      await api.workspaces.revokeInvite(workspaceId, invite.id);
      setInvites((prev) => (prev ?? []).filter((i) => i.id !== invite.id));
      toast("success", "Invitation canceled", invite.email);
    } catch {
      toast("error", "Couldn't cancel invite");
    } finally {
      setBusyInvite(undefined);
    }
  }

  const roleFilters: RoleFilter[] = ["ALL", "OWNER", "ADMIN", "MEMBER"];

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

        {/* Filter bar */}
        <div className="mb-5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 pl-9"
            />
          </div>
          <div className="flex gap-1.5">
            {roleFilters.map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                  roleFilter === r
                    ? "border-primary/40 bg-accent text-accent-foreground"
                    : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                {r === "ALL" ? "All" : r.toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Members */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {filteredMembers.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No members match.</p>
            ) : (
              filteredMembers.map((m, i) => {
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
              })
            )}
          </div>
        )}

        {/* Pending invitations */}
        {canManage && filteredInvites.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Mail className="h-4 w-4 text-muted-foreground" />
              Pending invitations
              <Badge tone="neutral">{filteredInvites.length}</Badge>
            </h2>
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-dashed border-border bg-card/60">
              {filteredInvites.map((inv) => (
                <div key={inv.id} className="flex items-center gap-3.5 p-3.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground">
                    <Mail className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{inv.email}</p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" /> Invited {timeAgo(inv.createdAt)} · pending
                    </p>
                  </div>
                  <Badge tone={roleTone[inv.role]}>{inv.role.toLowerCase()}</Badge>
                  <button
                    onClick={() => resendInvite(inv)}
                    disabled={busyInvite === inv.id}
                    title="Resend invitation"
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
                  >
                    <RotateCw className={cn("h-4 w-4", busyInvite === inv.id && "animate-spin")} />
                  </button>
                  <button
                    onClick={() => cancelInvite(inv)}
                    disabled={busyInvite === inv.id}
                    title="Cancel invitation"
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        workspaceId={workspaceId}
        onInvited={() => {
          void reload();
          void reloadInvites();
        }}
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
