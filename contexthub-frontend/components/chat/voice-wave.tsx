"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * The listening visualiser — an aurora ribbon that reacts to the actual
 * microphone signal.
 *
 * Three sine layers, each a blend of two frequencies, drifting at different
 * speeds so they interfere rather than march in step. Amplitude comes from
 * `getLevel()`; the back layers are blurred and offset to give the ribbon depth.
 *
 * Two implementation notes:
 *
 * - The animation writes `d` straight onto the path elements from a rAF loop.
 *   Driving 60fps through React state would re-render the composer on every
 *   frame for no reason.
 * - There is a small breathing floor under the level, so a silent mic still
 *   shows a living line instead of a flat one.
 */

const WIDTH = 240;
const HEIGHT = 44;
const MID = HEIGHT / 2;
const SAMPLES = 56;

/** Per-layer amplitude, drift speed, wavelength and opacity. */
const LAYERS = [
  { amp: 1, speed: 1.7, freq: 1.6, freq2: 3.1, opacity: 1, width: 2, blur: false },
  { amp: 0.72, speed: -1.15, freq: 2.3, freq2: 1.3, opacity: 0.6, width: 1.6, blur: true },
  { amp: 0.48, speed: 2.4, freq: 3.4, freq2: 2.1, opacity: 0.38, width: 1.2, blur: true },
];

/** Idle motion so the ribbon never looks frozen while the mic is quiet. */
const FLOOR = 0.06;
const MAX_AMPLITUDE = MID - 3;

export function VoiceWave({
  active,
  getLevel,
  className,
}: {
  active: boolean;
  /** Current loudness, 0–1. Called once per frame. */
  getLevel: () => number;
  className?: string;
}) {
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const glowRef = useRef<SVGCircleElement>(null);

  useEffect(() => {
    if (!active) return;

    let frame = 0;
    let start = 0;
    // Extra easing on top of the meter's own envelope — the meter tracks the
    // voice, this tracks the meter, and the second pass is what removes the
    // last of the visible stepping.
    let eased = 0;

    const draw = (now: number) => {
      if (!start) start = now;
      const t = (now - start) / 1000;

      const level = getLevel();
      eased += (level - eased) * 0.18;

      // A slow breath keeps the resting state alive.
      const breath = FLOOR * (1 + 0.45 * Math.sin(t * 1.9));
      const strength = Math.min(1, eased + breath);

      LAYERS.forEach((layer, i) => {
        const path = pathRefs.current[i];
        if (!path) return;
        path.setAttribute("d", ribbon(t * layer.speed, strength * layer.amp, layer));
      });

      if (glowRef.current) {
        glowRef.current.setAttribute("r", String(6 + strength * 26));
        glowRef.current.setAttribute("opacity", String(0.05 + strength * 0.22));
      }

      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [active, getLevel]);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden
      className={cn("h-11 w-full", className)}
    >
      <defs>
        <linearGradient id="voice-wave-stroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0" />
          <stop offset="18%" stopColor="var(--primary)" stopOpacity="1" />
          <stop offset="52%" stopColor="#a78bfa" stopOpacity="1" />
          <stop offset="84%" stopColor="#f0abfc" stopOpacity="1" />
          <stop offset="100%" stopColor="#f0abfc" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="voice-wave-glow">
          <stop offset="0%" stopColor="var(--primary)" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </radialGradient>
        <filter id="voice-wave-blur" x="-20%" y="-60%" width="140%" height="220%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
      </defs>

      {/* Soft bloom that swells with the voice. */}
      <circle
        ref={glowRef}
        cx={WIDTH / 2}
        cy={MID}
        r="6"
        fill="url(#voice-wave-glow)"
        opacity="0.05"
      />

      {LAYERS.map((layer, i) => (
        <path
          key={i}
          ref={(el) => {
            pathRefs.current[i] = el;
          }}
          fill="none"
          stroke="url(#voice-wave-stroke)"
          strokeWidth={layer.width}
          strokeLinecap="round"
          opacity={layer.opacity}
          filter={layer.blur ? "url(#voice-wave-blur)" : undefined}
          d={ribbon(0, FLOOR * layer.amp, layer)}
        />
      ))}
    </svg>
  );
}

/**
 * One layer's path. Two sines of different wavelength are blended so the crest
 * wanders instead of repeating, and an envelope tapers both ends to nothing so
 * the ribbon floats rather than being clipped by the viewBox.
 */
function ribbon(
  phase: number,
  amplitude: number,
  layer: { freq: number; freq2: number },
): string {
  const amp = amplitude * MAX_AMPLITUDE;
  let d = "";

  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const x = t * WIDTH;

    // sin(pi*t) is 0 at both ends, 1 in the middle; the power sharpens the taper.
    const envelope = Math.pow(Math.sin(Math.PI * t), 1.3);
    const wave =
      0.62 * Math.sin(t * layer.freq * Math.PI * 2 + phase) +
      0.38 * Math.sin(t * layer.freq2 * Math.PI * 2 - phase * 1.4);

    const y = MID + envelope * amp * wave;
    d += `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(2)} `;
  }

  return d.trim();
}

/**
 * The read-aloud indicator: three bars that step on real word boundaries.
 *
 * `pulse` increments once per spoken word (from the speech synthesis
 * `boundary` event), so each bar height is recomputed exactly when a new word
 * starts and eased into place by a CSS transition. The bars are in time with
 * the voice, rather than looping on a fixed interval like a fake equaliser.
 */
export function SpeakingBars({ pulse }: { pulse: number }) {
  return (
    <span className="flex h-3.5 items-end gap-[2.5px]" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-[2.5px] rounded-full bg-current"
          style={{
            // Deterministic but unpatterned: an irrational step means the trio
            // never settles into a visible loop.
            height: `${35 + 65 * Math.abs(Math.sin(pulse * 2.399 + i * 1.7))}%`,
            transition: "height 150ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
      ))}
    </span>
  );
}
