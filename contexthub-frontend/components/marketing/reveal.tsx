"use client";

import { motion, type Variants } from "framer-motion";

/** One easing curve for the whole site, matching --ease-out-soft in CSS. */
const EASE = [0.22, 1, 0.36, 1] as const;

const variants: Variants = {
  hidden: { opacity: 0, y: 22 },
  shown: { opacity: 1, y: 0 },
};

/**
 * Fades a section up as it scrolls into view.
 *
 * `once` is deliberate. Content that re-animates every time you scroll past it
 * is distracting on a long page, and it makes the page feel unstable when you
 * scroll back to re-read something. The margin fires the animation slightly
 * before the element reaches the fold so it is already settled by the time you
 * are looking at it.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: "-80px" }}
      variants={variants}
      transition={{ duration: 0.6, delay, ease: EASE }}
      data-reveal
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Same idea for lists: the parent staggers, children ride the shared variant.
 * Keeps a grid of cards from firing all at once, which reads as a flash.
 */
export function RevealGroup({
  children,
  className,
  stagger = 0.07,
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: "-60px" }}
      variants={{ shown: { transition: { staggerChildren: stagger } } }}
      data-reveal
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={variants}
      transition={{ duration: 0.55, ease: EASE }}
      data-reveal
      className={className}
    >
      {children}
    </motion.div>
  );
}
