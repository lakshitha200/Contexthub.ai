"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../api";
import type { Collection, Role, Workspace } from "../types";

interface WorkspaceContextValue {
  workspaceId: string;
  workspace: Workspace | null;
  collections: Collection[];
  role: Role | undefined;
  canManage: boolean;
  loading: boolean;
  error: string | undefined;
  reloadCollections: () => Promise<void>;
  reloadWorkspace: () => Promise<void>;
}

const Ctx = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: React.ReactNode;
}) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const reloadWorkspace = useCallback(async () => {
    const ws = await api.workspaces.get(workspaceId);
    setWorkspace(ws);
  }, [workspaceId]);

  const reloadCollections = useCallback(async () => {
    const cols = await api.collections.list(workspaceId);
    setCollections(cols);
  }, [workspaceId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(undefined);
    Promise.all([api.workspaces.get(workspaceId), api.collections.list(workspaceId)])
      .then(([ws, cols]) => {
        if (!active) return;
        setWorkspace(ws);
        setCollections(cols);
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : "Failed to load workspace"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [workspaceId]);

  const role = workspace?.role;
  const value: WorkspaceContextValue = {
    workspaceId,
    workspace,
    collections,
    role,
    canManage: role === "OWNER" || role === "ADMIN",
    loading,
    error,
    reloadCollections,
    reloadWorkspace,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
