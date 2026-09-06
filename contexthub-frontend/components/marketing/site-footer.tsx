import Link from "next/link";
import { BetaBadge, Wordmark } from "@/components/brand";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-sidebar">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-5">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <Wordmark size={28} beta={false} />
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              An AI knowledge workspace for teams. Upload what you know, then
              ask questions and get answers you can trace back to the source.
            </p>
          </div>

          <nav className="flex flex-wrap gap-10 sm:gap-14">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Product
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <a href="#features" className="text-muted-foreground transition-colors hover:text-foreground">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#how" className="text-muted-foreground transition-colors hover:text-foreground">
                    How it works
                  </a>
                </li>
                <li>
                  <a href="#pipeline" className="text-muted-foreground transition-colors hover:text-foreground">
                    Under the hood
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Account
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <Link href="/auth/login" className="text-muted-foreground transition-colors hover:text-foreground">
                    Sign in
                  </Link>
                </li>
                <li>
                  <Link href="/auth/register" className="text-muted-foreground transition-colors hover:text-foreground">
                    Create account
                  </Link>
                </li>
                <li>
                  <a href="#faq" className="text-muted-foreground transition-colors hover:text-foreground">
                    FAQ
                  </a>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            © 2026 ContextHub. All rights reserved.
          </p>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <BetaBadge />
            Answers are AI generated. Check the cited sources before relying on one.
          </p>
        </div>
      </div>
    </footer>
  );
}
