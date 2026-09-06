"use client";

import { AnimatePresence, motion } from "framer-motion";
import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { GoogleButton } from "@/components/auth/oauth-buttons";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { useToast } from "@/components/ui/toast";
import { ApiError, api } from "@/lib/api";
import { useAuthStore } from "@/lib/store/auth-store";

export default function RegisterPage() {
  const toast = useToast();
  const register = useAuthStore((s) => s.register);
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [sentTo, setSentTo] = useState<string>();
  const [resending, setResending] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password)) {
      setError("Password needs 8+ characters, with a letter and a number.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      await register({ email: form.email, password: form.password, name: form.name || undefined });
      setSentTo(form.email);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    if (!sentTo) return;
    setResending(true);
    try {
      await api.auth.resendVerification(sentTo);
      toast("success", "Verification email sent", `We re-sent the link to ${sentTo}.`);
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
      <AnimatePresence mode="wait">
        {sentTo ? (
          <motion.div key="sent" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
              <MailCheck className="h-7 w-7" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">Verify your email</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              We sent a verification link to <span className="font-medium text-foreground">{sentTo}</span>.
              Click it to activate your account, then sign in.
            </p>
            <Button variant="ghost" className="mt-6" onClick={resend} loading={resending}>
              Resend verification email
            </Button>
            <p className="mt-4 text-sm text-muted-foreground">
              <Link href="/auth/login" className="font-medium text-primary hover:underline">
                Back to sign in
              </Link>
            </p>
          </motion.div>
        ) : (
          <motion.div key="form" exit={{ opacity: 0 }}>
            <h2 className="text-2xl font-semibold tracking-tight">Create your account</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Start building your team&apos;s knowledge base.
            </p>

            <div className="mt-7">
              <GoogleButton />
            </div>

            <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or sign up with email
              <span className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <Field label="Name">
                <Input placeholder="Ada Lovelace" value={form.name} onChange={set("name")} autoComplete="name" />
              </Field>
              <Field label="Email">
                <Input type="email" placeholder="you@company.com" value={form.email} onChange={set("email")} required autoComplete="email" />
              </Field>
              <Field label="Password" hint="At least 8 characters, with a letter and a number.">
                <PasswordInput placeholder="••••••••" value={form.password} onChange={set("password")} required autoComplete="new-password" />
              </Field>
              <Field label="Confirm password" error={error}>
                <PasswordInput placeholder="••••••••" value={form.confirmPassword} onChange={set("confirmPassword")} required autoComplete="new-password" />
              </Field>
              <Button type="submit" size="lg" className="w-full" loading={loading}>
                Create account
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/auth/login" className="font-medium text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
