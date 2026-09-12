import { cn } from "@/lib/utils";

/**
 * The ContextHub glyph: a C holding a lit core.
 *
 * The C is the name. What it holds is the product: every answer here is drawn
 * out of the documents you gave it and carries a citation back to them, so the
 * mark is the workspace closing around a single bright point, the answer, with
 * the opening on the right where a question goes in.
 *
 * Shape decisions were made by rasterising this onto a 16px grid, because that
 * is where a logo actually spends its life: sidebar, browser tab, mobile bar.
 * Two things came out of that. The core is a diamond rather than a circle,
 * since at 16px it lands on about four pixels and a rotated square keeps a
 * defined silhouette where a circle turns to mush. And the C is one unbroken
 * stroke: a version split into page-like segments was indistinguishable from
 * this at 16px and read as a damaged C at 24px, which is a worse trade than
 * the meaning it bought.
 */
export function LogoGlyph({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      style={style}
    >
      {/* The C. Drawn the long way round from top-right to bottom-right, so the
          gap sits on the right where the eye expects a C to open. */}
      <path
        d="M17.65 6.91A7.6 7.6 0 1 0 17.65 17.09"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />

      {/* The answer it holds. */}
      <path d="M12 9.7 14.3 12 12 14.3 9.7 12z" fill="currentColor" />
      {/* Highlight, offset up and left so the core reads as lit rather than
          as a flat blob. */}
      <path
        d="M11.4 10.55 12.25 11.4 11.4 12.25 10.55 11.4z"
        fill="#fff"
        fillOpacity="0.5"
      />
    </svg>
  );
}

/** The glyph on its gradient tile. This is the logo as people see it. */
export function Logo({
  size = 30,
  className,
  /** Slowly drift the gradient. Turn it off inside dense lists. */
  live = true,
}: {
  size?: number;
  className?: string;
  live?: boolean;
}) {
  return (
    <span
      className={cn(
        "relative inline-grid shrink-0 place-items-center overflow-hidden rounded-[30%] text-white shadow-soft",
        live ? "bg-gradient-brand-live" : "bg-gradient-brand",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* Gloss: a soft highlight in the top left and a hairline inner rim.
          Cheap, and it stops the tile reading as flat printed colour. */}
      <span
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{
          background:
            "radial-gradient(72% 62% at 26% 20%, rgba(255,255,255,0.42) 0%, transparent 62%)",
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.16)",
        }}
      />
      <LogoGlyph className="relative" style={{ width: size * 0.66, height: size * 0.66 }} />
    </span>
  );
}

/**
 * Small gradient pill marking the product as pre release.
 *
 * Deliberately a label and not a link. It sets expectations beside the name
 * and asks nothing of you, so it can live in the sidebar all day.
 */
export function BetaBadge({ className }: { className?: string }) {
  return (
    <span
      title="ContextHub is in public beta. Features may change and data may be reset."
      className={cn(
        "select-none rounded-full bg-gradient-brand-live px-1.5 py-0.5",
        "text-[9px] font-bold uppercase leading-none tracking-[0.09em] text-white",
        "shadow-[0_1px_4px_-1px_color-mix(in_oklab,var(--primary)_70%,transparent)]",
        className,
      )}
    >
      Beta
    </span>
  );
}

/**
 * Logo plus name.
 *
 * `tone` decides how "Hub" is painted. Gradient text needs
 * `-webkit-text-fill-color: transparent`, and anything that later forces a
 * `color` on it wipes the gradient out and leaves invisible text. So on a
 * coloured panel we switch to a real solid colour with `tone="invert"` rather
 * than overriding the colour from outside and hoping.
 */
export function Wordmark({
  className,
  size = 30,
  beta = true,
  tone = "gradient",
}: {
  className?: string;
  size?: number;
  beta?: boolean;
  tone?: "gradient" | "invert";
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Logo size={size} />
      <span className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "text-[17px] font-semibold tracking-tight",
            tone === "invert" && "text-white",
          )}
        >
          Context
          <span className={tone === "gradient" ? "text-gradient" : undefined}>Hub</span>
        </span>
        {beta && <BetaBadge className="relative -top-px" />}
      </span>
    </div>
  );
}
