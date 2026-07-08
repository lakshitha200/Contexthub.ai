"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Spinner } from "@/components/ui/misc";
import { tokenStore } from "@/lib/token-store";
import { useAuthStore } from "@/lib/store/auth-store";

function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const [error, setError] = useState(false);

  useEffect(() => {
    const accessToken = params.get("accessToken");
    const refreshToken = params.get("refreshToken");
    if (!accessToken || !refreshToken) {
      setError(true);
      return;
    }
    tokenStore.set({ accessToken, refreshToken });
    void bootstrap().then(() => router.replace("/workspaces"));
  }, [params, bootstrap, router]);

  if (error) {
    return (
      <div className="text-center">
        <h2 className="text-lg font-semibold">Sign-in failed</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The link was missing tokens. Please try signing in again.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <Spinner className="h-6 w-6 text-primary" />
      <p className="text-sm text-muted-foreground">Completing sign-in…</p>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <Suspense fallback={<Spinner className="h-6 w-6" />}>
        <CallbackInner />
      </Suspense>
    </div>
  );
}
