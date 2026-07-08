import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-md bg-secondary/80 relative overflow-hidden",
        "after:absolute after:inset-0 after:animate-shimmer",
        "after:bg-gradient-to-r after:from-transparent after:via-black/[0.04] after:to-transparent",
        "dark:after:via-white/[0.05] after:bg-[length:600px_100%]",
        className,
      )}
      {...props}
    />
  );
}
