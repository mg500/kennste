"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Avatar } from "@/components/ui/primitives";
import { useMediaQuery } from "@/components/ui/useMediaQuery";
import type { Game, Player } from "@/lib/game/types";
import { playerColor } from "./shared";

// After a round with points, the result stays: the scores count up where they are shown anyway and re-sort.

type Scores = Record<string, number>;

/** A round that changed the score: the standings before and after. */
export interface ScoreEvent { before: Scores; after: Scores; round: number; key: number }

const gained = (before: Scores, after: Scores) => Object.keys(after).some(id => (after[id] ?? 0) > (before[id] ?? 0));

/** Coop games score for the team as a whole – nobody to rank. */
const isTeamGame = (game: Game) => game.mode.id === "timeline" && game.mode.settings.coop;

/** When the points of a round start counting up – after the round's own result had a moment. */
export const COUNT_DELAY_MS = 800;
/** How long "+N" stays next to whoever scored. */
export const GAIN_MS = 3500;

/** The scores as they are shown right now. */
export interface ShownScores {
  /** Counting up from before the round to after it. */
  scores: Scores;
  /** Who gained how much this round, while that is shown. */
  gains: Scores;
  /** Player IDs, best first: the order before the round until halfway through counting, then the new one. */
  order: string[];
  /** The round's change while its "+N" is shown (for a headline). */
  event: ScoreEvent | null;
}

/**
 * Notices a round that raised scores while the game runs (not the start cards, a reload or a new game): its scores
 * count up after `COUNT_DELAY_MS` and re-sort halfway, its gains show for `GAIN_MS` – until the next round starts.
 */
function useScoreCount(game: Game): ShownScores {
  const [seen, setSeen] = useState({ scores: game.scores, status: game.status });
  const [event, setEvent] = useState<ScoreEvent | null>(null);
  if (seen.scores !== game.scores || seen.status !== game.status) {
    setSeen({ scores: game.scores, status: game.status });
    if (seen.status === "playing" && game.status === "playing" && !isTeamGame(game) && gained(seen.scores, game.scores)) {
      setEvent({ before: seen.scores, after: game.scores, round: game.currentRound, key: (event?.key ?? 0) + 1 });
    }
  }
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");
  const elapsed = useElapsed(COUNT_DELAY_MS + Math.max(COUNT_MS, GAIN_MS), event?.key);
  const current = event && game.status === "playing" && game.currentRound === event.round ? event : null;
  if (!current) return { scores: game.scores, gains: {}, order: ranking(game.players, game.scores), event: null };
  const progress = easeOut((elapsed - COUNT_DELAY_MS) / COUNT_MS);
  const gains: Scores = {};
  const scores: Scores = { ...game.scores };
  for (const p of game.players) {
    const before = current.before[p.id] ?? 0;
    const gain = (current.after[p.id] ?? 0) - before;
    if (gain > 0) gains[p.id] = gain;
    scores[p.id] = Math.round(before + gain * progress);
  }
  const showing = elapsed >= COUNT_DELAY_MS && (reduce || elapsed < COUNT_DELAY_MS + GAIN_MS);
  return {
    scores, gains: showing ? gains : {},
    order: ranking(game.players, progress >= 0.5 ? current.after : current.before),
    event: showing ? current : null,
  };
}

const ShownScoresContext = createContext<ShownScores | null>(null);

/** Notices score changes once for the whole page, so the chips, standings and cards count up alike – even if they mount anew. */
export function ScoreCountProvider({ game, children }: { game: Game; children: ReactNode }) {
  return <ShownScoresContext.Provider value={useScoreCount(game)}>{children}</ShownScoresContext.Provider>;
}

/** The scores to show (counting up after a round, see ScoreCountProvider); without a provider, just the game's. */
export function useShownScores(game: Game): ShownScores {
  const shown = useContext(ShownScoresContext);
  return shown ?? { scores: game.scores, gains: {}, order: ranking(game.players, game.scores), event: null };
}

/** Slides the elements marked `data-flip="<key>"` inside `ref` from their old place to the new one when `order` changes. */
export function useFlip(ref: RefObject<HTMLElement | null>, order: string) {
  const last = useRef(new Map<string, { x: number; y: number }>());
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const origin = box.getBoundingClientRect();
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<string, { x: number; y: number }>();
    for (const el of box.querySelectorAll<HTMLElement>("[data-flip]")) {
      const rect = el.getBoundingClientRect();
      const at = { x: rect.x - origin.x, y: rect.y - origin.y };
      const was = last.current.get(el.dataset.flip!);
      if (was && !reduce && (was.x !== at.x || was.y !== at.y)) {
        el.animate?.([{ transform: `translate(${was.x - at.x}px, ${was.y - at.y}px)` }, { transform: "none" }],
          { duration: 600, easing: "cubic-bezier(.3,1.3,.5,1)" });
      }
      next.set(el.dataset.flip!, at);
    }
    last.current = next;
  }, [ref, order]);
}

/** The TV: who took the lead (or who scored most) while the round's points count up. */
export function ScoreHeadline({ game, className = "" }: { game: Game; className?: string }) {
  const { event } = useShownScores(game);
  if (!event) return null;
  return <span role="status" className={`bubble-in rounded-full bg-primary font-display font-extrabold text-on-accent ${className}`}>{headline(game, event)}</span>;
}

/** How long the standings take to fly into their place on the screen (or out of it). */
export const MORPH_MS = 450;

/** Where the standings live on the screen: the score chips on phones, the standings column on laptops. */
function standingsHome(): DOMRect | null {
  for (const el of document.querySelectorAll("[data-standings-home]")) {
    const rect = el.getBoundingClientRect();
    if (rect.width && rect.height) return rect;
  }
  return null;
}

/**
 * Shrinks `el` into the standings' place on the screen (`out`) or grows it from there (`in`), so everyone sees where to
 * tap to see them again. Without such a place (e.g. watching) or with reduced motion, it only fades.
 */
function morph(el: HTMLElement | null, direction: "in" | "out") {
  if (!el?.animate) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const home = reduce ? null : standingsHome();
  const rect = el.getBoundingClientRect();
  const away: Keyframe = home && rect.width
    ? {
      transform: `translate(${home.x + home.width / 2 - (rect.x + rect.width / 2)}px, ${home.y + home.height / 2 - (rect.y + rect.height / 2)}px) scale(${Math.max(home.width / rect.width, 0.05)})`,
      opacity: 0,
    }
    : { transform: "none", opacity: 0 };
  // Visible for most of the way: fades only close to the standings' place
  const frames: Keyframe[] = direction === "out"
    ? [{ transform: "none", opacity: 1 }, { opacity: 1, offset: 0.6 }, away]
    : [away, { opacity: 1, offset: 0.3 }, { transform: "none", opacity: 1 }];
  el.animate(frames, {
    duration: MORPH_MS, easing: direction === "out" ? "cubic-bezier(.55,0,.75,.2)" : "cubic-bezier(.25,.8,.45,1)", fill: "both",
  });
}

function fade(el: HTMLElement | null, direction: "in" | "out") {
  el?.animate?.([{ opacity: direction === "out" ? 1 : 0 }, { opacity: direction === "out" ? 0 : 1 }], { duration: MORPH_MS, fill: "both" });
}

/** A full-screen pop whose content flies into the standings' place when it's `leaving` (and, with `grow`, out of it when it opens). */
function MorphPop({ label, leaving, grow, onClose, children }: {
  label: string; leaving: boolean; grow?: boolean; onClose: () => void; children: ReactNode;
}) {
  const backdrop = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!grow) return;
    morph(content.current, "in");
    fade(backdrop.current, "in");
  }, [grow]);
  useLayoutEffect(() => {
    if (!leaving) return;
    morph(content.current, "out");
    fade(backdrop.current, "out");
  }, [leaving]);
  return (
    <div role="dialog" aria-label={label} onClick={onClose} className={`fixed inset-0 z-40 overflow-hidden text-text ${leaving ? "pointer-events-none" : ""}`}>
      <div ref={backdrop} aria-hidden className="absolute inset-0 bg-bg/95 backdrop-blur-sm" />
      <div ref={content} className="relative flex h-full flex-col items-center justify-center gap-6 px-5 py-8">{children}</div>
    </div>
  );
}

/** Open, closing (flying back to the standings' place) or closed – for a pop the player opened. */
export function useMorphOpen(): [open: boolean, leaving: boolean, show: () => void, close: () => void] {
  const [state, setState] = useState<"closed" | "open" | "leaving">("closed");
  useEffect(() => {
    if (state !== "leaving") return;
    const timer = setTimeout(() => setState("closed"), MORPH_MS);
    return () => clearTimeout(timer);
  }, [state]);
  return [state !== "closed", state === "leaving", () => setState("open"), () => setState(s => (s === "open" ? "leaving" : s))];
}

/**
 * Milliseconds since mount (or since `key` changed), ticking for `limit` ms (instantly done with reduced motion).
 * Measured by the clock, not counted frames: a tick that comes late (a tab in the background) lands where it belongs.
 */
function useElapsed(limit: number, key?: unknown) {
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [tick, setTick] = useState<{ key: unknown; elapsed: number }>({ key, elapsed: 0 });
  useEffect(() => {
    if (reduce) return;
    const start = Date.now();
    const timer = setInterval(() => {
      const elapsed = Math.min(limit, Date.now() - start);
      setTick({ key, elapsed });
      if (elapsed >= limit) clearInterval(timer);
    }, 40);
    return () => clearInterval(timer);
  }, [reduce, limit, key]);
  return reduce ? limit : tick.key === key ? tick.elapsed : 0;
}

const COUNT_FROM = 500;
const COUNT_MS = 1200;
const easeOut = (x: number) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;

/** Best first; ties in join order, so rows don't swap for nothing. */
function ranking(players: Player[], scores: Scores) {
  return [...players].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0)).map(p => p.id);
}

/** The standings counting up from `before` to `after`; rows slide to their new place halfway through. */
export function AnimatedStandings({ game, event, myId, large }: { game: Game; event: ScoreEvent; myId?: string; large?: boolean }) {
  const elapsed = useElapsed(COUNT_FROM + COUNT_MS + 200);
  const progress = easeOut((elapsed - COUNT_FROM) / COUNT_MS);
  const order = ranking(game.players, progress >= 0.5 ? event.after : event.before);
  const row = large ? 112 : 64;
  const gap = large ? 12 : 8;
  return (
    <ol aria-label="Zwischenstand" className="relative" style={{ height: game.players.length * (row + gap) - gap }}>
      {game.players.map(p => {
        const before = event.before[p.id] ?? 0;
        const gain = (event.after[p.id] ?? 0) - before;
        const rank = order.indexOf(p.id);
        return (
          <li key={p.id} style={{ height: row, transform: `translateY(${rank * (row + gap)}px)` }}
            className={`absolute inset-x-0 top-0 flex items-center transition-transform duration-500 ease-[cubic-bezier(.3,1.3,.5,1)] motion-reduce:transition-none ${p.id === myId ? "bg-surface-2" : "bg-surface"} ${large ? "gap-5 rounded-[28px] pr-7 pl-5" : "gap-3 rounded-2xl pr-4 pl-3"} ${gain && large ? "ring-[3px] ring-positive ring-inset" : ""}`}>
            <span className={`text-center font-display font-extrabold text-muted ${large ? "w-10 text-3xl" : "w-5"}`}>{rank + 1}</span>
            <Avatar name={p.name} color={playerColor(game, p.id)} size={large ? 64 : 38} />
            <span className={`min-w-0 flex-1 truncate font-bold ${large ? "text-[32px]" : "text-lg"}`}>{p.id === myId ? "Du" : p.name}</span>
            {gain > 0 && (
              <span className={`font-display font-extrabold text-positive-text transition-opacity duration-300 ${large ? "text-3xl" : "text-lg"} ${elapsed > 300 ? "opacity-100" : "opacity-0"}`}>+{gain}</span>
            )}
            <span className={`min-w-10 text-right font-display font-extrabold tabular-nums ${large ? "min-w-18 text-[56px]" : "text-[28px]"}`}>
              {Math.round(before + gain * progress)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** "Lea geht in Führung!" when the lead changed hands, else who scored most: "Tom holt +2". */
export function headline(game: Game, event: ScoreEvent, myId?: string): string {
  const name = (p: Player) => (p.id === myId ? "Du" : p.name);
  const leader = (scores: Scores) => {
    const top = Math.max(...game.players.map(p => scores[p.id] ?? 0));
    const leaders = game.players.filter(p => (scores[p.id] ?? 0) === top);
    return leaders.length === 1 ? leaders[0] : null;
  };
  const before = leader(event.before);
  const after = leader(event.after);
  if (after && after.id !== before?.id) return `${name(after)} ${after.id === myId ? "gehst" : "geht"} in Führung!`;
  const gains = game.players.map(p => ({ p, gain: (event.after[p.id] ?? 0) - (event.before[p.id] ?? 0) }));
  const best = Math.max(...gains.map(g => g.gain));
  const top = gains.filter(g => g.gain === best).map(g => g.p);
  if (top.length > 1) return `${top.slice(0, -1).map(name).join(", ")} und ${name(top.at(-1)!)} holen +${best}`;
  return `${name(top[0])} ${top[0].id === myId ? "holst" : "holt"} +${best}`;
}

/**
 * The standings on demand (a tap on the score chips): like after a round, without counting up; grows out of the chips
 * and stays until closed.
 */
export function StandingsPop({ game, myId, leaving, onClose }: { game: Game; myId?: string; leaving: boolean; onClose: () => void }) {
  const event: ScoreEvent = { before: game.scores, after: game.scores, round: game.currentRound, key: 0 };
  return (
    <MorphPop label="Zwischenstand" leaving={leaving} grow onClose={onClose}>
      <section className="flex w-full max-w-md flex-col gap-3">
        <h2 className="font-display text-3xl font-extrabold">Zwischenstand</h2>
        <AnimatedStandings game={game} event={event} myId={myId} />
      </section>
      <button onClick={onClose} className="h-11 px-4 text-sm text-muted">Schließen</button>
    </MorphPop>
  );
}
