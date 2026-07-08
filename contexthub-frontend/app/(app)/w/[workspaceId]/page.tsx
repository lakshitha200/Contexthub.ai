"use client";

import { useRouter } from "next/navigation";
import { use, useEffect } from "react";

export default function WorkspaceIndex({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = use(params);
  const router = useRouter();
  useEffect(() => {
    router.replace(`/w/${workspaceId}/chat`);
  }, [workspaceId, router]);
  return null;
}
