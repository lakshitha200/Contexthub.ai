"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { api } from "@/lib/api";

export default function MagicLinkPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      // Always resolves (backend returns success even for unknown emails to
      // avoid leaking which addresses are registered).
      await api.auth.requestMagicLink(email);
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
              We sent a magic sign-in link to <span className="font-medium text-foreground">{email}</span>.
              It expires in 15 minutes.
            </p>
          </motion.div>
        ) : (
          <motion.div key="form" exit={{ opacity: 0 }}>
            <h2 className="text-2xl font-semibold tracking-tight">Magic link sign-in</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              We&apos;ll email you a one-tap link — no password needed.
            </p>
            <form onSubmit={onSubmit} className="mt-7 space-y-4">
              <Field label="Email">
                <Input type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </Field>
              <Button type="submit" size="lg" className="w-full" loading={loading}>
                Send magic link
              </Button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
