"use client";

import { LogOut, Settings, User as UserIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Dropdown, DropdownItem, DropdownSeparator } from "@/components/ui/dropdown";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuthStore } from "@/lib/store/auth-store";

export function UserMenu() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  if (!user) return null;

  return (
    <Dropdown
      align="end"
      trigger={
        <button className="flex items-center gap-2 rounded-full outline-none ring-ring transition hover:opacity-90 focus-visible:ring-2">
          <Avatar name={user.name ?? user.email} src={user.avatarUrl} size={34} />
        </button>
      }
    >
      <div className="flex items-center gap-3 px-2.5 py-2">
        <Avatar name={user.name ?? user.email} src={user.avatarUrl} size={36} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{user.name ?? "Account"}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
      </div>
      <DropdownSeparator />
      <div className="flex items-center justify-between px-2.5 py-1.5">
        <span className="text-xs text-muted-foreground">Theme</span>
        <ThemeToggle />
      </div>
      <DropdownSeparator />
      <DropdownItem icon={<UserIcon className="h-4 w-4" />} onClick={() => router.push("/settings/profile")}>
        Profile
      </DropdownItem>
      <DropdownItem icon={<Settings className="h-4 w-4" />} onClick={() => router.push("/settings/profile")}>
        Account settings
      </DropdownItem>
      <DropdownSeparator />
      <DropdownItem
        danger
        icon={<LogOut className="h-4 w-4" />}
        onClick={async () => {
          await logout();
          router.replace("/auth/login");
        }}
      >
        Sign out
      </DropdownItem>
    </Dropdown>
  );
}
