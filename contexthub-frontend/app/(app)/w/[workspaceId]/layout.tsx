"use client";

import { use } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { WorkspaceProvider } from "@/lib/store/workspace-context";

export default function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = use(params);

  return (
    <WorkspaceProvider workspaceId={workspaceId}>
      <AppShell>{children}</AppShell>
    </WorkspaceProvider>
  );
}
