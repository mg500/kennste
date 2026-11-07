"use client";

import { createContext, useContext, type CSSProperties } from "react";

/** The running song's cover color (see Game.stageColor): every stage light on the page takes it on. */
export const StageLight = createContext<string | undefined>(undefined);

/**
 * Soft stage light behind the content (only visible in themes with --decor: 1, i.e. "Bühne").
 * Phones: from below, behind the buzzer; big screens and the end: from above. `color` overrides the tint (cover
 * color); otherwise the stage light of the game, if there is one. A new color fades in (--decor-tint, globals.css).
 */
export function Decor({ variant = "corner", color }: { variant?: "corner" | "confetti" | "wide"; color?: string }) {
  const stage = useContext(StageLight);
  const tint = color ?? stage ?? (variant === "corner" ? "var(--buzz)" : "var(--primary)");
  // Cover colors are less saturated than the stage's own, so they glow a bit stronger
  const strength = color || stage ? 34 : 24;
  const place = variant === "corner"
    ? "-bottom-40 h-[600px] w-[600px] lg:-bottom-[480px] lg:h-[1000px] lg:w-[1600px]"
    : "-top-[420px] h-[1000px] w-[1600px]";
  return (
    <div aria-hidden className="decor pointer-events-none absolute inset-0 overflow-hidden">
      <span className={`decor-light absolute left-1/2 -translate-x-1/2 rounded-full ${place}`}
        style={{ "--decor-tint": tint, background: `radial-gradient(closest-side, color-mix(in srgb, var(--decor-tint) ${strength}%, transparent), transparent)` } as CSSProperties} />
    </div>
  );
}
