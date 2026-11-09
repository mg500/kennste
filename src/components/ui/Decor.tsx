"use client";

import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { coverAccent } from "@/lib/accentColor";

/** The running song's cover color (see Game.stageColor): every stage light on the page takes it on. */
export const StageLight = createContext<string | undefined>(undefined);

/**
 * The accent of "Dunkel" and "Hell" follows the cover, too (see coverAccent; globals.css picks it up as --cover-fill
 * and --cover-text, "Bühne" keeps its own). Set on <html>, so sheets and menus take it on as well. A grey cover
 * (no color) keeps the accent of the song before; without any, it's the amber of globals.css.
 */
export function useCoverAccent(color: string | null | undefined) {
  const [last, setLast] = useState(color);
  if (color && color !== last) setLast(color);
  useEffect(() => {
    if (!last) return;
    const { fill, text } = coverAccent(last);
    const root = document.documentElement.style;
    root.setProperty("--cover-fill", fill);
    root.setProperty("--cover-text", text);
    return () => { root.removeProperty("--cover-fill"); root.removeProperty("--cover-text"); };
  }, [last]);
}

/** A game's pages: the stage light and the accent take on the running song's cover color. */
export function Stage({ color, children }: { color: string | undefined; children: ReactNode }) {
  useCoverAccent(color);
  return <StageLight value={color}>{children}</StageLight>;
}

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
