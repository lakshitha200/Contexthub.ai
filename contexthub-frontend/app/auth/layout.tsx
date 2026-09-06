"use client";

import { motion } from "framer-motion";
import { ArrowLeft, FileSearch, Quote, Waves } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Wordmark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuthStore } from "@/lib/store/auth-store";

/** What the product actually does today, three lines, no marketing filler. */
const HIGHLIGHTS = [
  {
    icon: FileSearch,
    title: "Reads the whole document",
    body: "PDFs, Word files, spreadsheets and slides, including tables, charts and scanned pages.",
  },
  {
    icon: Quote,
    title: "Answers with citations",
    body: "Every claim points back to the passage and page it came from, so you can check it.",
  },
  {
    icon: Waves,
    title: "Built for teams",
    body: "Workspaces, collections and roles keep each team's knowledge separate and private.",
  },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { status, bootstrap } = useAuthStore();

  useEffect(() => {
    if (status === "idle") void bootstrap();
    if (status === "authed") router.replace("/workspaces");
  }, [status, bootstrap, router]);

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-gradient-brand lg:block">
        <div className="absolute inset-0 bg-grid opacity-20 mix-blend-overlay" />
        {/* Ambient light. Static on purpose: a large blurred layer that
            animates forever keeps the compositor busy and costs scroll
            smoothness for an effect nobody is looking at. */}
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-white/25 blur-3xl" />
        <div className="absolute bottom-[-6rem] right-[-4rem] h-80 w-80 rounded-full bg-black/15 blur-3xl" />
        <div className="absolute left-1/3 top-1/2 h-64 w-64 rounded-full bg-white/10 blur-3xl" />

        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <Wordmark tone="invert" size={34} />

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-md"
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
              Public beta
            </span>

            <h1 className="mt-5 text-[2.6rem] font-semibold leading-[1.1] tracking-tight">
              Your team&apos;s documents,
              <br />
              finally answerable.
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-white/80">
              Upload what your team already knows, then just ask. ContextHub
              finds the exact passages and answers from those, never from
              guesswork.
            </p>

            <ul className="mt-9 space-y-4">
              {HIGHLIGHTS.map(({ icon: Icon, title, body }, i) => (
                <motion.li
                  key={title}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    delay: 0.25 + i * 0.09,
                    duration: 0.5,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="flex gap-3.5"
                >
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/20 bg-white/10 backdrop-blur">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{title}</p>
                    <p className="text-sm leading-relaxed text-white/70">{body}</p>
                  </div>
                </motion.li>
              ))}
            </ul>
          </motion.div>

          <p className="text-sm text-white/55">
            © 2026 ContextHub. Beta software, features may change.
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div className="relative flex flex-col items-center justify-center px-6 py-12">
        {/* Escape hatch back to the marketing page. Without it, anyone who
            lands straight on /auth/login has no way to read what this is. */}
        <Link
          href="/"
          className="absolute left-6 top-6 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <div className="absolute right-6 top-6">
          <ThemeToggle />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-sm"
        >
          <div className="mb-8 lg:hidden">
            <Wordmark />
          </div>
          {children}
        </motion.div>
      </div>
    </div>
  );
}
