"use client";

import { motion } from "framer-motion";
import { ArrowRight, FileText, Plus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Wordmark } from "@/components/brand";
import { UserMenu } from "@/components/layout/user-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateWorkspaceModal } from "@/components/workspace/create-workspace-modal";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks/use-async";
import { useAuthStore } from "@/lib/store/auth-store";
import { colorFromString } from "@/lib/utils";

export default function WorkspacesPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { data: workspaces, loading, setData } = useAsync(() => api.workspaces.list());
  const [creating, setCreating] = useState(false);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Wordmark />
          <UserMenu />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="mb-8 flex items-end justify-between gap-4"
        >
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {greeting()}, {user?.name?.split(" ")[0] ?? "there"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose a workspace to jump back in, or create a new one.
            </p>
          </div>
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New workspace
          </Button>
        </motion.div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : !workspaces?.length ? (
          <EmptyState
            icon={<Plus className="h-6 w-6" />}
            title="No workspaces yet"
            description="Create your first workspace to start uploading documents and asking questions."
            action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Create workspace</Button>}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workspaces.map((ws, i) => (
              <motion.button
                key={ws.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
                whileHover={{ y: -3 }}
                onClick={() => router.push(`/w/${ws.id}/chat`)}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card p-5 text-left shadow-soft transition-shadow hover:shadow-pop"
              >
                <div className="mb-4 flex items-start justify-between">
                  <div
                    className="grid h-11 w-11 place-items-center rounded-xl text-lg font-semibold text-white"
                    style={{ background: colorFromString(ws.name) }}
                  >
                    {ws.name.charAt(0).toUpperCase()}
                  </div>
                  {ws.role && <Badge tone={ws.role === "OWNER" ? "primary" : "neutral"}>{ws.role.toLowerCase()}</Badge>}
                </div>
                <h3 className="text-[15px] font-semibold tracking-tight">{ws.name}</h3>
                <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">
                  {ws.description ?? "No description"}
                </p>
                <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{ws.memberCount ?? "—"}</span>
                  <span className="inline-flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" />{ws.documentCount ?? "—"}</span>
                  <ArrowRight className="ml-auto h-4 w-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </main>

      <CreateWorkspaceModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(ws) => setData((prev) => [ws, ...(prev ?? [])])}
      />
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
