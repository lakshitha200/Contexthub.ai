"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { GoogleButton } from "@/components/auth/oauth-buttons";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { ApiError, api } from "@/lib/api";
import { useAuthStore } from "@/lib/store/auth-store";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [needsVerify, setNeedsVerify] = useState(false);
  const [resending, setResending] = useState(false);

  // Google OAuth bounces back here with ?error=... when it can't sign the user in
  // (e.g. the email already belongs to an email + password account).
  useEffect(() => {
    const e = params.get("error");
    if (e) setError(e);
  }, [params]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setNeedsVerify(false);
    setLoading(true);
    try {
      await login({ email, password });
      toast("success", "Welcome back!");
      const next = params.get("next");
      router.replace(next && next.startsWith("/") ? next : "/workspaces");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Something went wrong";
      setError(message);
      // 403 with a "verify your email" message → offer to resend the link.
      if (err instanceof ApiError && err.status === 403 && /verify/i.test(message)) {
        setNeedsVerify(true);
      }
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setResending(true);
    try {
      await api.auth.resendVerification(email);
      toast("success", "Verification email sent", `Check ${email} for the link.`);
      setNeedsVerify(false);
    } finally {
      setResending(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Welcome back. Enter your details to continue.
      </p>

      <div className="mt-7 space-y-3">
        <GoogleButton />
      </div>

      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or continue with email
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email">
          <Input
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label="Password" error={error}>
          <PasswordInput
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        {needsVerify && (
          <Button type="button" variant="ghost" className="w-full" onClick={resend} loading={resending}>
            Resend verification email
          </Button>
        )}
        <div className="flex justify-end">
          <Link
            href="/auth/forgot-password"
            className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/auth/register" className="font-medium text-primary hover:underline">
          Create one
        </Link>
      </p>
    </motion.div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Spinner className="h-6 w-6" />}>
      <LoginInner />
    </Suspense>
  );
}
