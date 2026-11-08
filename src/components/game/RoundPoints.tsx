"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Zap } from "lucide-react";
import { Avatar } from "@/components/ui/primitives";
import { useMediaQuery } from "@/components/ui/useMediaQuery";
import { getMode } from "@/lib/game/modes";
import type { Game, Player } from "@/lib/game/types";
import { playerColor, scoreText } from "./shared";

// After a round with points: they pop up like the "?!" at the start, then the standings count up and re-sort.

type Scores = Record<string, number>;

/** A round that changed the score: the standings before and after, and who could score in it. */
export interface ScoreEvent { before: Scores; after: Scores; round: number; key: number; couldScore: string[] }

const gained = (before: Scores, after: Scores) => Object.keys(after).some(id => (after[id] ?? 0) > (before[id] ?? 0));

/** Coop games score for the team as a whole – nobody to rank. */
const isTeamGame = (game: Game) => game.mode.id === "timeline" && game.mode.settings.coop;

/**
 * Notices a round that raised scores while the game runs (not the start cards, a reload or a new game) and shows it
 * after `delay` – time for the round's own result – for `duration`, unless the next round starts first. Then it is
 * `leaving` for `leaveMs` (time to fly away) before it's gone; closing it leaves the same way.
 */
export function useScoreEvent(game: Game, delay: number, duration: number, leaveMs = 0): [ScoreEvent | null, boolean, () => void] {
  const [seen, setSeen] = useState({ scores: game.scores, status: game.status });
  const [event, setEvent] = useState<ScoreEvent | null>(null);
  const [shown, setShown] = useState<number | null>(null);
  const [leaving, setLeaving] = useState<number | null>(null);
  if (seen.scores !== game.scores || seen.status !== game.status) {
    setSeen({ scores: game.scores, status: game.status });
    if (seen.status === "playing" && game.status === "playing" && !isTeamGame(game) && gained(seen.scores, game.scores)) {
      const canScore = getMode(game.mode.id).canScore;
      const couldScore = game.players.filter(p => canScore?.(game, p.id) ?? true).map(p => p.id);
      setEvent({ before: seen.scores, after: game.scores, round: game.currentRound, key: (event?.key ?? 0) + 1, couldScore });
    }
  }
  useEffect(() => {
    if (!event) return;
    const show = setTimeout(() => setShown(event.key), delay);
    const leave = setTimeout(() => (leaveMs ? setLeaving(event.key) : setShown(null)), delay + duration);
    return () => { clearTimeout(show); clearTimeout(leave); };
  }, [event, delay, duration, leaveMs]);
  useEffect(() => {
    if (leaving === null) return;
    const hide = setTimeout(() => setShown(shown => (shown === leaving ? null : shown)), leaveMs);
    return () => clearTimeout(hide);
  }, [leaving, leaveMs]);
  const visible = event && shown === event.key && game.status === "playing" && game.currentRound === event.round ? event : null;
  return [visible, !!visible && leaving === visible.key, () => { if (visible) setLeaving(visible.key); }];
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

/** Milliseconds since mount, ticking for `limit` ms (instantly done with reduced motion). */
function useElapsed(limit: number) {
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      setElapsed(now - start);
      if (now - start < limit) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduce, limit]);
  return reduce ? limit : elapsed;
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
  if (top.length > 1) return `${top.map(name).join(" und ")} holen +${best}`;
  return `${name(top[0])} ${top[0].id === myId ? "holst" : "holt"} +${best}`;
}

/** Whoever got the speed bonus this round, if the mode has one. */
function fastestOf(game: Game): string | undefined {
  const round = (game.mode as { round?: { result?: { fastest?: string } } }).round;
  return round?.result?.fastest;
}

/** How long the points after a round stay, before they fly into the standings' place. */
export const POINTS_MS = 3500;

/**
 * Phones and laptops: your points jump in, then the standings count up. Tapping closes it; it closes by itself
 * after a few seconds and as soon as the next round starts – flying into the score chips (or the standings column).
 */
export function PointsPop({ game, myId }: { game: Game; myId?: string }) {
  const [event, leaving, close] = useScoreEvent(game, 1500, POINTS_MS, MORPH_MS);
  if (!event) return null;
  const isPlayer = !!myId && game.players.some(p => p.id === myId);
  const gain = isPlayer ? (event.after[myId] ?? 0) - (event.before[myId] ?? 0) : 0;
  const head = headline(game, event, myId);
  // Not your turn to score (or watching): no "kein Punkt", just what the others got
  const bystander = !isPlayer || !event.couldScore.includes(myId);
  const best = Math.max(...game.players.map(p => (event.after[p.id] ?? 0) - (event.before[p.id] ?? 0)));
  return (
    <MorphPop label="Punkte dieser Runde" leaving={leaving} onClose={close}>
      <div key={event.key} className="flex flex-col items-center gap-2 text-center" role="status">
        {gain > 0 ? <>
          <span className="splash-pop font-display text-[150px] leading-[0.85] font-extrabold text-primary tabular-nums lg:text-[200px]">+{gain}</span>
          <span className="splash-rise font-display text-3xl font-extrabold">{scoreText(game, gain)} für dich!</span>
          {fastestOf(game) === myId && (
            <span className="splash-rise mt-1 inline-flex h-8 items-center gap-1.5 rounded-full bg-surface px-3 text-sm font-bold text-positive-text">
              <Zap size={15} aria-hidden />Mit Bonus – du warst am schnellsten
            </span>
          )}
          {!head.startsWith("Du ") && <span className="splash-rise text-muted">{head}</span>}
        </> : bystander ? <>
          <span className="splash-pop font-display text-[150px] leading-[0.85] font-extrabold text-primary tabular-nums lg:text-[200px]">+{best}</span>
          <span className="splash-rise font-display text-3xl font-extrabold">{head}</span>
        </> : <>
          <span className="splash-pop font-display text-8xl leading-none font-extrabold text-muted">0</span>
          <span className="splash-rise font-display text-[26px] font-extrabold">Diesmal kein Punkt</span>
          <span className="splash-rise text-muted">{head}</span>
        </>}
      </div>
      <section className="flex w-full max-w-md flex-col gap-3">
        <h2 className="text-lg font-bold">Zwischenstand</h2>
        <AnimatedStandings game={game} event={event} myId={myId} />
      </section>
      <button onClick={close} className="h-11 px-4 text-sm text-muted">Schließen</button>
    </MorphPop>
  );
}

/**
 * The standings on demand (a tap on the score chips): like after a round, without counting up; grows out of the chips
 * and stays until closed.
 */
export function StandingsPop({ game, myId, leaving, onClose }: { game: Game; myId?: string; leaving: boolean; onClose: () => void }) {
  const event: ScoreEvent = { before: game.scores, after: game.scores, round: game.currentRound, key: 0, couldScore: [] };
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

/** The TV: once the round's result had its moment, the standings with who scored most, big. */
export function ScoreInterlude({ game }: { game: Game }) {
  const [event] = useScoreEvent(game, 2500, 6500);
  if (!event) return null;
  const best = Math.max(...game.players.map(p => (event.after[p.id] ?? 0) - (event.before[p.id] ?? 0)));
  return (
    <div role="status" aria-label="Zwischenstand" className="absolute inset-0 z-40 flex items-center gap-14 bg-bg px-14 py-12 text-text">
      <div key={event.key} className="flex min-w-0 flex-1 flex-col gap-4">
        <span className="splash-pop font-display text-[260px] leading-[0.8] font-extrabold text-primary tabular-nums">+{best}</span>
        <span className="splash-rise font-display text-7xl leading-none font-extrabold">{headline(game, event)}</span>
        <span className="splash-rise text-3xl text-muted">Zwischenstand nach {game.settings.goal === "rounds" ? `Runde ${game.currentRound}` : "dieser Runde"}</span>
      </div>
      <div className="w-[640px] shrink-0">
        <AnimatedStandings game={game} event={event} large />
      </div>
    </div>
  );
}
