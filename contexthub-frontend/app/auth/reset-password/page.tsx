"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { ApiError, api } from "@/lib/api";
import { useAuthStore } from "@/lib/store/auth-store";

function ResetInner() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const setUser = useAuthStore((s) => s.setUser);
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    if (!token) {
      setError("This reset link is missing its token.");
      return;
    }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError("Password needs 8+ characters, with a letter and a number.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      const { user } = await api.auth.resetPassword(token, password);
      setUser(user);
      toast("success", "Password updated", "You're now signed in.");
      router.replace("/workspaces");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "This reset link is invalid or has expired.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <h2 className="text-2xl font-semibold tracking-tight">Set a new password</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Choose a new password for your account.
      </p>

      <form onSubmit={onSubmit} className="mt-7 space-y-4">
        <Field label="New password" hint="At least 8 characters, with a letter and a number.">
          <PasswordInput placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
        </Field>
        <Field label="Confirm password" error={error}>
          <PasswordInput placeholder="••••••••" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Update password
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/auth/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </motion.div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Spinner className="h-6 w-6" />}>
      <ResetInner />
    </Suspense>
  );
}
