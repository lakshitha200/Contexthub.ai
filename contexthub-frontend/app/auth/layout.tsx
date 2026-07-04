"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Wordmark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuthStore } from "@/lib/store/auth-store";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { status, bootstrap } = useAuthStore();

  useEffect(() => {
    if (status === "idle") void bootstrap();
    if (status === "authed") router.replace("/workspaces");
  }, [status, bootstrap, router]);

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-gradient-brand lg:block">
        <div className="absolute inset-0 bg-grid opacity-20 mix-blend-overlay" />
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-white/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-black/10 blur-3xl" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <Wordmark className="[&_span]:text-white" size={34} />
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="max-w-md"
          >
            <h1 className="text-4xl font-semibold leading-tight tracking-tight">
              Your team&apos;s knowledge, answered.
            </h1>
            <p className="mt-4 text-lg text-white/80">
              Upload documents, then ask anything. ContextHub retrieves the exact
              passages and answers with citations — never guesses.
            </p>
            <div className="mt-8 flex items-center gap-6 text-sm text-white/70">
              <span>Grounded answers</span>
              <span className="h-1 w-1 rounded-full bg-white/40" />
              <span>Inline citations</span>
              <span className="h-1 w-1 rounded-full bg-white/40" />
              <span>Team workspaces</span>
            </div>
          </motion.div>
          <p className="text-sm text-white/60">© 2026 ContextHub</p>
        </div>
      </div>

      {/* Form panel */}
      <div className="relative flex flex-col items-center justify-center px-6 py-12">
        <div className="absolute right-6 top-6">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Wordmark />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
