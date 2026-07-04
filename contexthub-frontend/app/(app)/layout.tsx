"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Logo } from "@/components/brand";
import { useAuthStore } from "@/lib/store/auth-store";

/** Auth gate for every signed-in surface. Bootstraps the session, and bounces
 * guests to the login page. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { status, bootstrap } = useAuthStore();

  useEffect(() => {
    if (status === "idle") void bootstrap();
    if (status === "guest") router.replace("/auth/login");
  }, [status, bootstrap, router]);

  if (status !== "authed") {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Logo size={40} className="animate-pulse" />
      </div>
    );
  }

  return <>{children}</>;
}
