"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Wordmark } from "@/components/brand";
import { Sidebar } from "@/components/layout/sidebar";
import { useWorkspace } from "@/lib/store/workspace-context";
import { EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const { error } = useWorkspace();
  const router = useRouter();

  if (error) {
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <EmptyState
          title="Workspace unavailable"
          description={error}
          action={<Button onClick={() => router.push("/workspaces")}>Back to workspaces</Button>}
        />
      </div>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawer(false)}
            />
            <motion.div
              className="absolute left-0 top-0 h-full"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", duration: 0.35, bounce: 0.1 }}
            >
              <Sidebar onNavigate={() => setDrawer(false)} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <div className="flex h-14 items-center justify-between border-b border-border px-4 lg:hidden">
          <button onClick={() => setDrawer(true)} className="rounded-lg p-2 hover:bg-secondary">
            {drawer ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Wordmark size={24} />
          <div className="w-9" />
        </div>

        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
