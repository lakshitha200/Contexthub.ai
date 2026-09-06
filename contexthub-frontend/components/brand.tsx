import { cn } from "@/lib/utils";

/**
 * The ContextHub glyph, on a 24 unit grid.
 *
 * Three sources feed beams into a hexagonal hub with a lit core. It is the
 * product in one mark: many documents converge on one grounded answer, and the
 * core is the answer. Stroke weights are tuned to survive 16px, which is where
 * it actually spends most of its life (sidebar, tab, mobile bar).
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
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      {/* Beams travelling inward. They stop short of the hub so the eye
          finishes the line, which keeps the centre from clogging up. */}
      <g strokeWidth="1.5" opacity="0.55">
        <path d="M4.6 7.3 9.1 9.9" />
        <path d="M4.6 16.7 9.1 14.1" />
        <path d="M19.6 12H14.9" />
      </g>

      {/* The sources. */}
      <g fill="currentColor" stroke="none">
        <circle cx="3.4" cy="6.65" r="1.45" opacity="0.95" />
        <circle cx="3.4" cy="17.35" r="1.45" opacity="0.8" />
        <circle cx="20.6" cy="12" r="1.45" opacity="0.65" />
      </g>

      {/* The hub. */}
      <path
        d="M12 6.2 16.8 8.97v5.53L12 17.3 7.2 14.5V8.97z"
        fill="currentColor"
        fillOpacity="0.18"
        strokeWidth="1.6"
      />

      {/* The answer, with a highlight notch so the core reads as lit rather
          than as a flat dot. */}
      <circle cx="12" cy="12" r="2.15" fill="currentColor" stroke="none" />
      <circle cx="11.3" cy="11.3" r="0.62" fill="#fff" fillOpacity="0.5" stroke="none" />
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
