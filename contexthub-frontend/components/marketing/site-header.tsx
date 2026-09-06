"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Wordmark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { tokenStore } from "@/lib/token-store";

const NAV = [
  { href: "#features", label: "Features" },
  { href: "#how", label: "How it works" },
  { href: "#pipeline", label: "Under the hood" },
  { href: "#faq", label: "FAQ" },
];

/** How far the page must actually move before an open panel gives up. */
const SCROLL_CLOSE_THRESHOLD = 64;

/**
 * Whether this browser already holds a session.
 *
 * Read through useSyncExternalStore rather than an effect: the server snapshot
 * says "signed out" so the markup Next renders is stable, then the client
 * snapshot corrects it on hydration. Tokens only change on sign in and sign
 * out, both of which navigate away from this page, so there is nothing to
 * subscribe to and the unsubscribe is a no-op.
 */
const noopSubscribe = () => () => {};

function useHasSession() {
  return useSyncExternalStore(
    noopSubscribe,
    () => tokenStore.has(),
    () => false,
  );
}

/**
 * Whether the page has scrolled away from the top.
 *
 * Also read as an external store, which handles the awkward case for free: a
 * page loaded straight onto an anchor starts already scrolled, and reading the
 * value during render gets that right where a mount effect would flash the
 * wrong state first. Returning a boolean means React re-renders only when the
 * bar actually needs to change, not on every scroll event.
 */
function subscribeScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

function useScrolled() {
  return useSyncExternalStore(
    subscribeScroll,
    () => window.scrollY > 8,
    () => false,
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const signedIn = useHasSession();
  const scrolled = useScrolled();

  // Dismiss the open panel on Escape, on a tap outside it, and once the page
  // has genuinely scrolled.
  //
  // The threshold matters. Closing on any scroll event at all meant the panel
  // shut the instant it opened: expanding the header is itself a layout change,
  // and on a phone the address bar collapsing fires a scroll too, so the panel
  // opened and closed inside one frame and looked like a dead button.
  useEffect(() => {
    if (!open) return;

    const startY = window.scrollY;
    const onScroll = () => {
      if (Math.abs(window.scrollY - startY) > SCROLL_CLOSE_THRESHOLD) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!headerRef.current?.contains(e.target as Node)) setOpen(false);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <header
      ref={headerRef}
      className="site-header sticky top-0 z-50"
      data-scrolled={scrolled}
      data-open={open}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-5">
        {/* The wordmark is the only thing guaranteed a place at every width,
            so it keeps its beta pill. Everything else earns its space. */}
        <Link href="/" className="min-w-0 rounded-lg" aria-label="ContextHub home">
          <Wordmark size={28} />
        </Link>

        {/* The full row needs roughly 795px: wordmark 165, four nav links 330,
            theme toggle 90, and two buttons 190. At the md breakpoint only
            ~736px is available and it overflowed, so the desktop layout starts
            at lg and tablets get the panel instead. */}
        <nav className="hidden items-center gap-1 lg:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <ThemeToggle />
          {signedIn ? (
            <Link href="/workspaces">
              <Button size="sm" className="group">
                Open workspace
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
              </Button>
            </Link>
          ) : (
            <>
              <Link href="/auth/login">
                <Button size="sm" variant="ghost">
                  Sign in
                </Button>
              </Link>
              <Link href="/auth/register">
                <Button size="sm" className="group">
                  Get started
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                </Button>
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-nav"
          className="-mr-1 grid h-10 w-10 shrink-0 place-items-center rounded-lg transition-colors hover:bg-secondary lg:hidden"
        >
          {/* Cross-fading the two icons avoids the layout jump you get from
              swapping elements, and reads as one control changing state. */}
          <span className="relative block h-5 w-5">
            <Menu
              className={`absolute inset-0 h-5 w-5 transition-all duration-300 ${
                open ? "rotate-90 scale-75 opacity-0" : "rotate-0 scale-100 opacity-100"
              }`}
            />
            <X
              className={`absolute inset-0 h-5 w-5 transition-all duration-300 ${
                open ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-75 opacity-0"
              }`}
            />
          </span>
        </button>
      </div>

      {/* Panel for everything below lg.
          Height is animated by Framer Motion rather than the 0fr to 1fr grid
          trick, so the panel is genuinely mounted or unmounted and its
          visibility never depends on a browser interpolating
          `grid-template-rows`. Same approach as the beta banner. */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="mobile-nav"
            id="mobile-nav"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden lg:hidden"
          >
            <nav className="border-t border-border px-4 py-4 sm:px-5">
              {/* Two columns from sm up: on a tablet a single stack of four
                  short links leaves the panel mostly empty. */}
              <ul className="grid gap-0.5 sm:grid-cols-2 sm:gap-x-3">
                {NAV.map((item) => (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="block rounded-lg px-3 py-2.5 text-[15px] font-medium text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>

              <div className="mt-4 border-t border-border pt-4">
                <div className="flex flex-col gap-2.5 sm:flex-row-reverse sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                    {signedIn ? (
                      <Link href="/workspaces" onClick={() => setOpen(false)} className="block">
                        <Button size="lg" className="w-full sm:w-auto">
                          Open workspace
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </Link>
                    ) : (
                      <>
                        <Link
                          href="/auth/login"
                          onClick={() => setOpen(false)}
                          className="order-2 block sm:order-1"
                        >
                          <Button size="lg" variant="outline" className="w-full sm:w-auto">
                            Sign in
                          </Button>
                        </Link>
                        <Link
                          href="/auth/register"
                          onClick={() => setOpen(false)}
                          className="order-1 block sm:order-2"
                        >
                          <Button size="lg" className="w-full sm:w-auto">
                            Get started
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </Link>
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-2 sm:pt-0">
                    <span className="text-sm text-muted-foreground">Theme</span>
                    <ThemeToggle />
                  </div>
                </div>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
