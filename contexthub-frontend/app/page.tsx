"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Logo } from "@/components/brand";
import { tokenStore } from "@/lib/token-store";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace(tokenStore.has() ? "/workspaces" : "/auth/login");
  }, [router]);

  return (
    <div className="grid min-h-dvh place-items-center">
      <Logo size={44} className="animate-pulse" />
    </div>
  );
}
