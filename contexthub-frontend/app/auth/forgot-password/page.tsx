"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      // Always resolves — the backend returns success even for unknown emails
      // so we don't reveal which addresses are registered.
      await api.auth.forgotPassword(email);
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <Link href="/auth/login" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to sign in
      </Link>

      <AnimatePresence mode="wait">
        {sent ? (
          <motion.div key="sent" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
              <MailCheck className="h-7 w-7" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">Check your inbox</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              If an account exists for <span className="font-medium text-foreground">{email}</span>, we sent a
              link to reset your password. It expires in 30 minutes.
            </p>
          </motion.div>
        ) : (
          <motion.div key="form" exit={{ opacity: 0 }}>
            <h2 className="text-2xl font-semibold tracking-tight">Forgot your password?</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Enter your email and we&apos;ll send you a link to reset it. You can also use this to set a
              password if you signed up with Google.
            </p>
            <form onSubmit={onSubmit} className="mt-7 space-y-4">
              <Field label="Email">
                <Input type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              </Field>
              <Button type="submit" size="lg" className="w-full" loading={loading}>
                Send reset link
              </Button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
