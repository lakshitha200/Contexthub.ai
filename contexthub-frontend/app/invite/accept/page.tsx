"use client";

import { motion } from "framer-motion";
import { AlertCircle, CheckCircle2, MailOpen } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Wordmark } from "@/components/brand";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { ApiError, api } from "@/lib/api";
import { useAuthStore } from "@/lib/store/auth-store";

function AcceptInner() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const { status, user, bootstrap } = useAuthStore();

  const token = params.get("token");
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);

  // Figure out whether the user is signed in (fresh page load resets the store).
  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  async function accept() {
    if (!token) return;
    setAccepting(true);
    setError(undefined);
    try {
      await api.workspaces.acceptInvite(token);
      setDone(true);
      toast("success", "Invitation accepted", "You've joined the workspace.");
      setTimeout(() => router.replace("/workspaces"), 1000);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "This invitation has expired, was already used, or was issued for a different email.",
      );
    } finally {
      setAccepting(false);
    }
  }

  const signInHref = `/auth/login?next=${encodeURIComponent(
    `/invite/accept?token=${token ?? ""}`,
  )}`;

  return (
    <div className="relative grid min-h-dvh place-items-center bg-background px-6">
      <div className="absolute left-6 top-6">
        <Wordmark />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm rounded-xl border border-border bg-card p-8 text-center shadow-soft"
      >
        {/* Missing token */}
        {!token ? (
          <Errored message="This invite link is missing its token." onGo={() => router.replace("/workspaces")} />
        ) : done ? (
          <>
            <IconBadge tone="success"><CheckCircle2 className="h-7 w-7" /></IconBadge>
            <h1 className="mt-4 text-lg font-semibold">You&apos;re in!</h1>
            <p className="mt-1 text-sm text-muted-foreground">Taking you to your workspaces…</p>
          </>
        ) : error ? (
          <Errored message={error} onGo={() => router.replace("/workspaces")} showSwitch />
        ) : status === "idle" || status === "loading" ? (
          <>
            <Spinner className="mx-auto h-7 w-7 text-primary" />
            <p className="mt-3 text-sm text-muted-foreground">Loading your invitation…</p>
          </>
        ) : status === "guest" ? (
          // Not signed in — show the invite, ask them to sign in first.
          <>
            <IconBadge><MailOpen className="h-7 w-7" /></IconBadge>
            <h1 className="mt-4 text-lg font-semibold">You&apos;ve been invited</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in to accept this workspace invitation.
            </p>
            <Button className="mt-6 w-full" onClick={() => router.push(signInHref)}>
              Sign in to accept
            </Button>
          </>
        ) : (
          // Signed in — explicit accept.
          <>
            <IconBadge><MailOpen className="h-7 w-7" /></IconBadge>
            <h1 className="mt-4 text-lg font-semibold">Accept invitation</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              You&apos;ve been invited to join a workspace on ContextHub.
            </p>
            {user && (
              <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-1.5 text-xs">
                <Avatar name={user.name ?? user.email} src={user.avatarUrl} size={20} />
                <span className="text-muted-foreground">Accepting as</span>
                <span className="font-medium">{user.email}</span>
              </div>
            )}
            <Button className="mt-6 w-full" onClick={accept} loading={accepting}>
              Accept invitation
            </Button>
            <p className="mt-4 text-xs text-muted-foreground">
              Wrong account?{" "}
              <Link href={signInHref} className="font-medium text-primary hover:underline">
                Switch account
              </Link>
            </p>
          </>
        )}
      </motion.div>
    </div>
  );
}

function IconBadge({ children, tone = "primary" }: { children: React.ReactNode; tone?: "primary" | "success" }) {
  return (
    <div
      className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${
        tone === "success" ? "bg-success/10 text-success" : "bg-accent text-accent-foreground"
      }`}
    >
      {children}
    </div>
  );
}

function Errored({ message, onGo, showSwitch }: { message: string; onGo: () => void; showSwitch?: boolean }) {
  return (
    <>
      <IconBadge tone="primary">
        <AlertCircle className="h-7 w-7 text-danger" />
      </IconBadge>
      <h1 className="mt-4 text-lg font-semibold">Couldn&apos;t accept invite</h1>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      <Button className="mt-6 w-full" onClick={onGo}>
        Go to my workspaces
      </Button>
      {showSwitch && (
        <p className="mt-4 text-xs text-muted-foreground">
          Signed in with the wrong account?{" "}
          <Link href="/auth/login" className="font-medium text-primary hover:underline">
            Switch account
          </Link>
        </p>
      )}
    </>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<div className="grid min-h-dvh place-items-center"><Spinner className="h-6 w-6" /></div>}>
      <AcceptInner />
    </Suspense>
  );
}
