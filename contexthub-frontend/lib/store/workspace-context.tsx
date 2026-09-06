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
  /** Optimistically add/replace a collection so the UI updates instantly. */
  upsertCollection: (col: Collection) => void;
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

  const upsertCollection = useCallback((col: Collection) => {
    setCollections((prev) =>
      prev.some((c) => c.id === col.id)
        ? prev.map((c) => (c.id === col.id ? col : c)) // rename: replace in place
        : [col, ...prev], // create: prepend (list is newest-first)
    );
  }, []);

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
    upsertCollection,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
