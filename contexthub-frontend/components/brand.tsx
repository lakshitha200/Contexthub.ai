import { cn } from "@/lib/utils";

/** ContextHub mark — a gradient "layered knowledge" glyph. */
export function Logo({ size = 30, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn("inline-grid place-items-center rounded-[10px] bg-gradient-brand text-white shadow-soft", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="none">
        <path
          d="M12 3 3 7.5 12 12l9-4.5L12 3Z"
          fill="currentColor"
          fillOpacity="0.95"
        />
        <path d="M3 12l9 4.5L21 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fillOpacity="0.4" />
        <path d="M3 16.5 12 21l9-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
      </svg>
    </span>
  );
}

export function Wordmark({ className, size = 30 }: { className?: string; size?: number }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Logo size={size} />
      <span className="text-[17px] font-semibold tracking-tight">
        Context<span className="text-gradient">Hub</span>
      </span>
    </div>
  );
}
