"use client";

import { useEffect, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { Decor } from "@/components/ui/Decor";
import { useCountdown } from "@/components/ui/useCountdown";
import { modeName } from "@/lib/game/modes/groups";
import { START_COUNTDOWN_SEC } from "@/lib/game/reducer";
import type { Game } from "@/lib/game/types";
import { goalText } from "./shared";

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
  return `${modeName(game.mode)} · ${goalText(game)}`;
}

/**
 * The "Kennste?!" logo, popping up for a moment when the game starts or everyone is back in the lobby. Tap to skip.
 * Before the start it counts down (see StartCountdown); `onCancel` lets the host call that off.
 */
export function Splash({ game, large, onCancel }: { game: Game | null; large?: boolean; onCancel?: () => void }) {
  const { splash, close } = useSplash(game?.status);
  // Closing the lobby during a game is no "back in the lobby" – the evening's summary takes over
  if (game?.closedAt) return null;
  if (game?.status === "lobby" && game.countdown) return <StartCountdown game={game} large={large} onCancel={onCancel} />;
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

/**
 * The logo counting down to the start: the seconds stand where the "?!" goes, which takes over at 0 (then the start
 * splash above follows). Below, what the server prepares meanwhile. The time runs for everyone, so it can't be skipped.
 */
function StartCountdown({ game, large, onCancel }: { game: Game; large?: boolean; onCancel?: () => void }) {
  const countdown = game.countdown!;
  const seconds = useCountdown(START_COUNTDOWN_SEC, countdown.endsAt - START_COUNTDOWN_SEC * 1000, true)?.seconds ?? 0;
  const players = game.players.filter(p => !game.viewers.includes(p.id)).length;
  const steps = game.settings.songSource === "playlist" ? [
    { done: countdown.songs !== undefined, label: countdown.songs !== undefined ? "Songs bereit" : "Songs werden geladen" },
    { done: !!countdown.years, label: countdown.years ? "Erscheinungsjahre geprüft" : "Erscheinungsjahre werden geprüft" },
  ] : [];
  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-bg px-5 pt-4 pb-7 text-text lg:px-14 lg:py-10">
      <Decor variant={large ? "wide" : "corner"} />
      <div role="status" className={`relative flex flex-1 items-center justify-center text-center ${large ? "gap-16" : "flex-col gap-4 lg:flex-row lg:gap-14"}`}>
        <span className={`flex justify-center ${large ? "w-[360px]" : "lg:w-[320px]"}`}>
          <span key={seconds} aria-label={seconds ? `Noch ${seconds} ${seconds === 1 ? "Sekunde" : "Sekunden"}` : "Gleich geht's los"}
            className={`splash-pop font-display leading-[0.85] font-extrabold text-primary tabular-nums ${large ? "text-[340px]" : "text-[170px] lg:text-[300px]"}`}
            style={{ textShadow: `0 ${large ? 16 : 9}px 0 var(--primary-shade)` }}>{seconds || "?!"}</span>
        </span>
        <div className={`flex flex-col ${large ? "items-start gap-5 text-left" : "items-center gap-4 lg:items-start lg:text-left"}`}>
          <span className={`font-display leading-none font-extrabold tracking-tight ${large ? "text-[120px]" : "text-[54px] lg:text-[104px]"}`}>Kennste?!</span>
          <span className="flex flex-col gap-1.5">
            <span className={`font-bold ${large ? "text-4xl" : "text-[22px] lg:text-[34px]"}`}>{seconds ? "Gleich geht's los" : "Musik wird vorbereitet …"}</span>
            <span className={`text-muted ${large ? "text-[28px]" : "text-base lg:text-[22px]"}`}>{subtitle(game, "start")} · {players} Spieler</span>
          </span>
          <span aria-hidden className="flex gap-1.5 lg:gap-2.5">
            {Array.from({ length: START_COUNTDOWN_SEC }, (_, i) => (
              <span key={i} className={`h-2 w-8.5 rounded-full lg:h-3 lg:w-16 ${i < seconds ? "bg-primary" : "bg-surface-2"}`} />
            ))}
          </span>
          {steps.length > 0 && (
            <ul className={`gap-7 ${large ? "flex text-[22px]" : "hidden lg:flex lg:text-lg"}`}>
              {steps.map(s => <Step key={s.label} {...s} large />)}
            </ul>
          )}
        </div>
      </div>
      {steps.length > 0 && !large && (
        <ul className="relative flex flex-col gap-2 rounded-card bg-surface px-4 py-3.5 lg:hidden">
          {steps.map(s => <Step key={s.label} {...s} />)}
        </ul>
      )}
      {onCancel && (
        <button type="button" onClick={onCancel}
          className="relative mt-3 h-12 rounded-2xl border-2 border-surface-2 font-bold lg:absolute lg:bottom-10 lg:left-1/2 lg:w-56 lg:-translate-x-1/2">
          Abbrechen
        </button>
      )}
    </div>
  );
}

function Step({ done, label, large }: { done: boolean; label: string; large?: boolean }) {
  const size = large ? 22 : 18;
  return (
    <li className={`flex items-center gap-2.5 ${done ? "" : "text-muted"}`}>
      {done
        ? <Check size={size} strokeWidth={3} className="text-positive-text" aria-hidden />
        : <LoaderCircle size={size} className="animate-spin motion-reduce:animate-none" aria-hidden />}
      {label}
    </li>
  );
}
