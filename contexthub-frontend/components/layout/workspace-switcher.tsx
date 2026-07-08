"use client";

import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dropdown, DropdownItem, DropdownLabel, DropdownSeparator } from "@/components/ui/dropdown";
import { CreateWorkspaceModal } from "@/components/workspace/create-workspace-modal";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks/use-async";
import { useWorkspace } from "@/lib/store/workspace-context";
import { cn, colorFromString } from "@/lib/utils";

export function WorkspaceSwitcher() {
  const router = useRouter();
  const { workspaceId, workspace } = useWorkspace();
  const { data: workspaces, setData } = useAsync(() => api.workspaces.list());
  const [creating, setCreating] = useState(false);

  return (
    <>
      <Dropdown
        className="w-[248px]"
        trigger={
          <button className="flex w-full items-center gap-2.5 rounded-lg border border-transparent p-1.5 text-left transition-colors hover:bg-secondary">
            <Swatch name={workspace?.name ?? "?"} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{workspace?.name ?? "Loading…"}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {workspace?.role ? workspace.role.toLowerCase() : "workspace"}
              </span>
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        }
      >
        <DropdownLabel>Workspaces</DropdownLabel>
        {workspaces?.map((ws) => (
          <DropdownItem
            key={ws.id}
            onClick={() => router.push(`/w/${ws.id}/chat`)}
            icon={<Swatch name={ws.name} size={22} />}
          >
            <span className="flex-1 truncate">{ws.name}</span>
            {ws.id === workspaceId && <Check className="h-4 w-4 text-primary" />}
          </DropdownItem>
        ))}
        <DropdownSeparator />
        <DropdownItem icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
          New workspace
        </DropdownItem>
        <DropdownItem onClick={() => router.push("/workspaces")} className="text-muted-foreground">
          View all workspaces
        </DropdownItem>
      </Dropdown>

      <CreateWorkspaceModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(ws) => {
          setData((prev) => [ws, ...(prev ?? [])]);
          router.push(`/w/${ws.id}/chat`);
        }}
      />
    </>
  );
}

function Swatch({ name, size = 30 }: { name: string; size?: number }) {
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-lg font-semibold text-white")}
      style={{ width: size, height: size, background: colorFromString(name), fontSize: size * 0.42 }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
