"use client";

import { FileText, FolderClosed, MessagesSquare, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/brand";
import { UserMenu } from "@/components/layout/user-menu";
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import { useWorkspace } from "@/lib/store/workspace-context";
import { cn, colorFromString } from "@/lib/utils";

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { workspaceId, collections } = useWorkspace();
  const pathname = usePathname();
  const base = `/w/${workspaceId}`;

  const nav = [
    { href: `${base}/chat`, label: "Chat", icon: MessagesSquare },
    { href: `${base}/documents`, label: "Documents", icon: FileText },
    { href: `${base}/members`, label: "Members", icon: Users },
    { href: `${base}/settings`, label: "Settings", icon: Settings },
  ];

  return (
    <aside className="flex h-full w-[264px] flex-col border-r border-border bg-sidebar">
      <div className="flex h-16 items-center px-3">
        <Wordmark size={26} />
      </div>

      <div className="px-3 pb-2">
        <WorkspaceSwitcher />
      </div>

      <nav className="px-3 py-2">
        <ul className="space-y-0.5">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-secondary text-foreground"
                      : "text-sidebar-foreground hover:bg-secondary/60 hover:text-foreground",
                  )}
                >
                  <Icon className={cn("h-[18px] w-[18px]", active && "text-primary")} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-2 flex-1 overflow-y-auto px-3 scroll-slim">
        <p className="px-3 pb-1.5 pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Collections
        </p>
        <ul className="space-y-0.5">
          {collections.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted-foreground">No collections yet</li>
          )}
          {collections.map((c) => {
            const href = `${base}/documents?collection=${c.id}`;
            const active = pathname === `${base}/documents` && false;
            return (
              <li key={c.id}>
                <Link
                  href={href}
                  onClick={onNavigate}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
                    active ? "bg-secondary" : "hover:bg-secondary/60",
                  )}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorFromString(c.name) }} />
                  <span className="flex-1 truncate text-sidebar-foreground group-hover:text-foreground">{c.name}</span>
                  {typeof c.documentCount === "number" && (
                    <span className="text-xs text-muted-foreground">{c.documentCount}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex items-center justify-between border-t border-border p-3">
        <div className="flex items-center gap-2.5">
          <FolderClosed className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{collections.length} collections</span>
        </div>
        <UserMenu />
      </div>
    </aside>
  );
}
