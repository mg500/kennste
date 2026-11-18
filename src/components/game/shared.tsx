"use client";

import { useContext, useRef, type ReactNode } from "react";
import { ExternalLink, LoaderCircle, Settings } from "lucide-react";
import { Avatar, IconButton, Pill } from "@/components/ui/primitives";
import { StandingsPop, useFlip, useMorphOpen, useShownScores } from "./RoundPoints";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Decor, StageLight } from "@/components/ui/Decor";
import { getMode } from "@/lib/game/modes";
import type { Game, Player } from "@/lib/game/types";

/** Stable color per player: join order across players and viewers, cycling through the theme's player palette. */
export function playerColor(game: Game, playerId: string): string {
  const all = [...game.players, ...(game.viewerPlayers ?? [])].sort((a, b) => a.joinedAt - b.joinedAt);
  const index = Math.max(0, all.findIndex(p => p.id === playerId));
  return `var(--p${(index % 6) + 1})`;
}

export function findPlayer(game: Game, playerId: string | undefined): Player | undefined {
  return [...game.players, ...(game.viewerPlayers ?? [])].find(p => p.id === playerId);
}

/** German genitive for "Leas Song" / "Max' Song". */
export function genitive(name: string) {
  return /[sßxz]$/i.test(name) ? `${name}'` : `${name}s`;
}

/**
 * Full-height page frame: a phone column, and with `desktop` a wide layout from 1024px on.
 * `header` spans the full width; `aside` becomes a right-hand column on desktop (hidden on phones).
 */
export function Screen({ children, decor, desktop, header, aside }: {
  children: ReactNode;
  decor?: "corner" | "confetti";
  desktop?: boolean;
  header?: ReactNode;
  aside?: ReactNode;
}) {
  // A game with a stage light shows it on every screen
  const light = useContext(StageLight) ? "corner" : undefined;
  const glow = decor ?? light;
  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-bg text-text">
      {glow && <Decor variant={glow} />}
      <div className={`relative mx-auto flex min-h-dvh w-full max-w-md flex-col gap-3.5 px-5 pt-4 pb-6 ${desktop ? "lg:max-w-[1440px] lg:gap-7 lg:px-14 lg:pt-8 lg:pb-10" : ""}`}>
        {header}
        {aside ? (
          <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-10">
            <div className="flex min-w-0 flex-1 flex-col gap-3.5 lg:gap-6">{children}</div>
            <aside className="hidden lg:block lg:self-start">{aside}</aside>
          </div>
        ) : children}
      </div>
    </main>
  );
}

/** The team outcome of a finished coop game, or null for a normal ranking. */
export function teamOutcome(game: Game) {
  return getMode(game.mode.id).teamResult?.(game.mode) ?? null;
}

/** "1 Punkt" / "3 Karten" — in the mode's unit. */
export function scoreText(game: Game, n: number) {
  const unit = getMode(game.mode.id).scoreUnit ?? { one: "Punkt", many: "Punkte" };
  return `${n} ${n === 1 ? unit.one : unit.many}`;
}

/**
 * How long the game goes, e.g. "10 Songs" or "Bis 10 Karten". Where players take turns, a round is one song per
 * person, so it says so – the same words in the lobby and at the start.
 */
export function goalText(game: Game) {
  const s = game.settings;
  if (s.goal !== "rounds") return `Bis ${scoreText(game, s.targetScore)}`;
  return `${s.maxRounds} ${lengthLabel(game)}`;
}

/** What the length is counted in: songs, per person where players take turns. */
export function lengthLabel(game: Game) {
  return getMode(game.mode.id).simultaneous ? "Songs" : "Songs pro Person";
}

export function roundLabel(game: Game) {
  return game.settings.goal === "rounds"
    ? `Runde ${game.currentRound}/${game.settings.maxRounds}`
    : `Bis ${scoreText(game, game.settings.targetScore)}`;
}

/** "+N" on a score that just went up. */
export function GainBadge({ gain, className = "" }: { gain: number; className?: string }) {
  return <span className={`bubble-in absolute -top-2 -right-1 inline-flex h-5 items-center rounded-full bg-positive px-1.5 text-xs font-extrabold text-on-accent ${className}`}>+{gain}</span>;
}

/** From this many players, the score chips get a row of their own on phones (they don't fit next to the round). */
const CHIPS_OWN_ROW = 5;

/**
 * The scores at a glance, best first; a tap shows the full standings. After a round they count up in place: who
 * scored gets a ring and "+N", the chips slide into their new order.
 */
function ScoreChips({ game, myId, wrap }: { game: Game; myId?: string; wrap?: boolean }) {
  const [open, leaving, show, close] = useMorphOpen();
  const { scores, gains, order } = useShownScores(game);
  const list = useRef<HTMLButtonElement>(null);
  useFlip(list, order.join());
  return (
    <>
      <button ref={list} onClick={show} aria-label="Punktestand anzeigen" data-standings-home
        className={`flex min-w-0 flex-1 gap-1.5 pt-2 text-left ${wrap ? "flex-wrap" : "-mt-2 overflow-hidden pr-1 [mask-image:linear-gradient(to_right,black_80%,transparent)]"}`}>
        {order.map(id => findPlayer(game, id)).map(p => p && (
          <span key={p.id} data-flip={p.id}
            className={`relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-surface pl-1 pr-2.5 text-sm font-bold tabular-nums transition-shadow ${gains[p.id] ? "ring-2 ring-positive ring-inset" : ""}`}>
            <Avatar name={p.name} color={playerColor(game, p.id)} size={28} />
            <span className="sr-only">{p.name}:</span>
            {scores[p.id] ?? 0}
            {!!gains[p.id] && <GainBadge gain={gains[p.id]} />}
          </span>
        ))}
      </button>
      {open && <StandingsPop game={game} myId={myId} leaving={leaving} onClose={close} />}
    </>
  );
}

/** Round / goal and score chips, plus the game menu for the host (which holds the theme switch) or the theme switch. */
export function TopBar({ game, myId, onMenu, label }: { game: Game; myId?: string; onMenu?: () => void; label?: string }) {
  const ownRow = game.players.length >= CHIPS_OWN_ROW;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Pill className="shrink-0 lg:h-11 lg:px-5 lg:text-base">{label ?? roundLabel(game)}</Pill>
        {/* On desktop the standings live in the sidebar instead */}
        {ownRow ? <div className="flex-1" /> : <div className="flex min-w-0 flex-1 lg:hidden"><ScoreChips game={game} myId={myId} /></div>}
        <div className="hidden flex-1 lg:block" />
        <MenuOrTheme onMenu={onMenu} />
      </div>
      {ownRow && <div className="flex lg:hidden"><ScoreChips game={game} myId={myId} wrap /></div>}
    </div>
  );
}

export function MenuOrTheme({ onMenu }: { onMenu?: () => void }) {
  return onMenu
    ? <IconButton label="Spielmenü" onClick={onMenu}><Settings size={18} aria-hidden /></IconButton>
    : <ThemeToggle compact />;
}

/** Ranked player list. Highlights players in `highlight` (e.g. who just scored). */
export function Standings({ game, highlight = [], animate, large, details, note }: {
  game: Game;
  highlight?: string[];
  animate?: boolean;
  large?: boolean;
  /** Extra content below a player's row (e.g. their guessed songs). */
  details?: (playerId: string) => ReactNode;
  /** Short status after the name (e.g. "übersprungen"). */
  note?: (playerId: string) => string | undefined;
}) {
  // Counting up after a round (where the page notices it, see ScoreCountProvider)
  const shown = useShownScores(game);
  const { scores, gains, order } = animate ? shown : { scores: game.scores, gains: {} as Record<string, number>, order: shown.order };
  const sorted = (animate ? order : [...game.players].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0)).map(p => p.id))
    .map(id => findPlayer(game, id)).filter(p => !!p);
  const list = useRef<HTMLOListElement>(null);
  useFlip(list, sorted.map(p => p.id).join());
  return (
    <ol ref={list} className="flex flex-col gap-1.5">
      {sorted.map((p, i) => (
        <li key={p.id} data-flip={p.id} className={`rounded-xl px-2 transition-shadow ${highlight.includes(p.id) ? "bg-surface-2" : ""} ${gains[p.id] ? "ring-2 ring-positive ring-inset" : ""}`}>
          <div className={`flex items-center gap-3 ${large ? "h-15" : "h-12"}`}>
            <span className="w-5 text-center font-extrabold text-muted">{i + 1}</span>
            <Avatar name={p.name} color={playerColor(game, p.id)} size={large ? 42 : 34} />
            <span className={`flex-1 font-medium ${large ? "text-xl" : ""}`}>
              {p.name}
              {note?.(p.id) && <span className="ml-2 text-sm font-normal text-muted">{note(p.id)}</span>}
            </span>
            {!!gains[p.id] && <span className={`bubble-in font-display font-extrabold text-positive-text ${large ? "text-2xl" : "text-lg"}`}>+{gains[p.id]}</span>}
            <span className={`font-display font-extrabold tabular-nums ${large ? "text-3xl" : "text-2xl"}`}>{scores[p.id] ?? 0}</span>
          </div>
          {details?.(p.id)}
        </li>
      ))}
    </ol>
  );
}

/** Desktop sidebar: the standings, with an optional per-player status. */
export function ScoreAside({ game, myId, note, title }: {
  game: Game; myId: string; note?: (playerId: string) => string | undefined; title?: string;
}) {
  const heading = title ?? getMode(game.mode.id).scoreUnit?.many ?? "Punktestand";
  return (
    <div data-standings-home className="rounded-[28px] bg-surface p-5">
      <h2 className="mb-2 text-xl font-bold">{heading}</h2>
      <Standings game={game} highlight={[myId]} animate note={id => note?.(id) ?? (id === myId ? "du" : undefined)} />
    </div>
  );
}

/** Shown to everyone while the server reads more songs of the playlist from Spotify. */
export function LoadingSongs({ game, large }: { game: Game; large?: boolean }) {
  // During the start countdown, the countdown says so; in the lobby, the songs button and the start button
  if (!game.playlistLoading || game.countdown || game.status === "lobby") return null;
  return (
    <div role="status" className={`fixed top-4 left-1/2 z-50 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-surface-2 px-4 py-2 font-bold whitespace-nowrap shadow-xl ${large ? "top-8 px-6 py-3 text-2xl" : ""}`}>
      <LoaderCircle size={large ? 26 : 18} className="animate-spin" aria-hidden />Neue Songs werden geladen …
    </div>
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="status" className="fixed bottom-6 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl bg-buzz px-4 py-3 text-center font-bold text-on-accent shadow-xl">
      {message}
    </div>
  );
}

export const spotifyUrl = (trackId: string) => `https://open.spotify.com/track/${trackId}`;

/**
 * After the reveal: opens the song in Spotify, e.g. to save it. Its ID comes from the round's record – during the
 * round devices only get a stand-in (see viewFor), and there is no record before the reveal.
 */
export function SpotifyLink({ game, song, className = "" }: { game: Game; song: { name: string; artist: string }; className?: string }) {
  const record = game.history?.findLast(r => r.song.name === song.name && r.song.artist === song.artist);
  if (!record) return null;
  return (
    <a href={spotifyUrl(record.song.trackId)} target="_blank" rel="noreferrer"
      className={`inline-flex h-11 w-fit items-center gap-1.5 text-sm font-bold text-muted hover:text-text ${className}`}>
      <ExternalLink size={15} aria-hidden />In Spotify öffnen
    </a>
  );
}
