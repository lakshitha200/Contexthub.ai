"use client";

import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/store/auth-store";

function VerifyInner() {
  const router = useRouter();
  const params = useSearchParams();
  const setUser = useAuthStore((s) => s.setUser);
  const [error, setError] = useState<string>();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const token = params.get("token");
    if (!token) {
      setError("This magic link is missing its token.");
      return;
    }
    api.auth
      .verifyMagicLink(token)
      .then(({ user }) => {
        setUser(user);
        router.replace("/workspaces");
      })
      .catch(() => setError("This magic link is invalid or has expired."));
  }, [params, router, setUser]);

  if (error) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-danger/10 text-danger">
          <AlertCircle className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">Link expired</h2>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <Button className="mt-6" onClick={() => router.replace("/auth/magic-link")}>
          Request a new link
        </Button>
        <p className="mt-4 text-sm text-muted-foreground">
          <Link href="/auth/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <Spinner className="h-6 w-6 text-primary" />
      <p className="text-sm text-muted-foreground">Signing you in…</p>
    </div>
  );
}

export default function MagicLinkVerifyPage() {
  return (
    <Suspense fallback={<Spinner className="h-6 w-6" />}>
      <VerifyInner />
    </Suspense>
  );
}
