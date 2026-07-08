"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/store/auth-store";
import { formatDate } from "@/lib/utils";

export default function ProfilePage() {
  const { user, setUser } = useAuthStore();
  const toast = useToast();
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name ?? "");
      setAvatarUrl(user.avatarUrl ?? "");
    }
  }, [user]);

  async function save() {
    setSaving(true);
    try {
      const updated = await api.auth.updateProfile({ name: name.trim(), avatarUrl: avatarUrl.trim() || undefined });
      setUser(updated);
      toast("success", "Profile updated");
    } catch {
      toast("error", "Couldn't save profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-6">
          <Link href="/workspaces" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to workspaces
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage how you appear across ContextHub.</p>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center gap-4">
              <Avatar name={name || user?.email} src={avatarUrl || user?.avatarUrl} size={64} />
              <div>
                <p className="text-sm font-medium">{user?.email}</p>
                <p className="text-xs text-muted-foreground">
                  Joined {user ? formatDate(user.createdAt) : "—"}
                </p>
              </div>
            </div>
            <Field label="Display name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={100} />
            </Field>
            <Field label="Avatar URL" hint="Optional — link to an image.">
              <Input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" />
            </Field>
            <div className="flex justify-end">
              <Button onClick={save} loading={saving}>Save profile</Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
