"use client";

import { useEffect, useState } from "react";
import { Decor } from "@/components/ui/Decor";
import { getMode } from "@/lib/game/modes";
import type { Game } from "@/lib/game/types";
import { scoreText } from "./shared";

/** How long the logo stays up, and how long it takes to fade out. */
export const SPLASH_MS = 1500;
const FADE_MS = 300;

type Kind = "start" | "lobby";

/**
 * Which splash to show: the game just started, or everyone just came back to the lobby. Only changes seen
 * while the page is open count – after a reload (or when the game first loads) nothing pops up.
 */
function useSplash(status: Game["status"] | undefined) {
  const [seen, setSeen] = useState(status);
  const [splash, setSplash] = useState<{ kind: Kind; leaving: boolean } | null>(null);
  if (status !== seen) {
    setSeen(status);
    if (seen && status === "playing") setSplash({ kind: "start", leaving: false });
    else if (seen && status === "lobby") setSplash({ kind: "lobby", leaving: false });
  }
  useEffect(() => {
    if (!splash) return;
    const timer = setTimeout(() => (splash.leaving ? setSplash(null) : setSplash({ ...splash, leaving: true })), splash.leaving ? FADE_MS : SPLASH_MS);
    return () => clearTimeout(timer);
  }, [splash]);
  return { splash, close: () => setSplash(null) };
}

function subtitle(game: Game, kind: Kind) {
  if (kind === "lobby") return "Gleich geht's weiter";
  const length = game.settings.goal === "rounds" ? `${game.settings.maxRounds} Runden` : `Bis ${scoreText(game, game.settings.targetScore)}`;
  return `${getMode(game.mode.id).name} · ${length}`;
}

/** The "Kennste?!" logo, popping up for a moment when the game starts or everyone is back in the lobby. Tap to skip. */
export function Splash({ game, large }: { game: Game | null; large?: boolean }) {
  const { splash, close } = useSplash(game?.status);
  if (!splash || !game) return null;
  return (
    <button type="button" onClick={close} aria-label="Logo ausblenden"
      className={`fixed inset-0 z-50 flex cursor-pointer items-center justify-center overflow-hidden bg-bg text-text transition-opacity duration-300 ${splash.leaving ? "opacity-0" : "opacity-100"}`}>
      <Decor variant={large ? "wide" : "corner"} />
      <div role="status" className={`relative flex items-center text-center ${large ? "gap-14" : "flex-col gap-5"}`}>
        <span aria-hidden className={`splash-pop font-display leading-[0.85] font-extrabold text-primary ${large ? "text-[300px]" : "text-[150px]"}`}
          style={{ textShadow: `0 ${large ? 16 : 9}px 0 var(--primary-shade)` }}>?!</span>
        <div className={`flex flex-col ${large ? "items-start gap-5 text-left" : "items-center gap-4"}`}>
          <span className={`splash-pop font-display leading-none font-extrabold tracking-tight ${large ? "text-[120px]" : "text-[54px]"}`}>Kennste?!</span>
          <span className="splash-rise flex flex-col gap-1.5">
            <span className={`font-bold ${large ? "text-4xl" : "text-[22px]"}`}>{splash.kind === "start" ? "Los geht's!" : "Zurück in der Lobby"}</span>
            <span className={`text-muted ${large ? "text-[28px]" : "text-base"}`}>{subtitle(game, splash.kind)}</span>
          </span>
        </div>
      </div>
    </button>
  );
}
