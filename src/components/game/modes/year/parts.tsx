"use client";

import { useEffect, useRef } from "react";
import { Music, Pause, Play, Timer } from "lucide-react";
import { Avatar, ProgressBar } from "@/components/ui/primitives";
import { useCountdown } from "@/components/ui/useCountdown";
import type { YearData, YearRound, YearSong } from "@/lib/game/modes/year";
import type { Game } from "@/lib/game/types";
import type { GameControls, ReceivedPlayback } from "@/lib/game/useGameSession";
import { usePlaybackProgress } from "@/lib/game/useGameSession";
import { playerColor } from "../../shared";

export const SLIDER_MIN = 1950;
export const thisYear = () => new Date().getFullYear();

/** Seconds left to guess (ticking), or null without limit / before the song plays. */
export function useGuessCountdown(data: YearData) {
  return useCountdown(data.settings.guessTimeLimit, data.round?.playingAt, data.round?.state === "guessing");
}

/** The host's client ends guessing when the time is up (the server checks the deadline). */
export function useTimeout(round: YearRound | undefined, left: ReturnType<typeof useCountdown>, isHost: boolean, act: GameControls["act"]) {
  const sent = useRef<string | null>(null);
  const expired = isHost && round?.state === "guessing" && left?.seconds === 0;
  const trackId = round?.trackId;
  useEffect(() => {
    if (!expired || !trackId || sent.current === trackId) return;
    const timer = setTimeout(() => { sent.current = trackId; act({ type: "timeout" }); }, 500);
    return () => clearTimeout(timer);
  }, [expired, trackId, act]);
}

/** "Aus welchem Jahr ist der Song?" with countdown and playback progress; play/pause for the host. */
export function SongCard({ round, playback, left, act, large }: {
  round: YearRound; playback: ReceivedPlayback | null; left: ReturnType<typeof useCountdown>;
  act?: GameControls["act"]; large?: boolean;
}) {
  const progress = usePlaybackProgress(playback, round.trackId);
  const isPlaying = progress?.isPlaying ?? false;
  return (
    <div className={`flex items-center gap-4 rounded-card bg-buzz text-on-accent ${large ? "gap-8 rounded-[36px] p-8" : "p-4 lg:gap-6 lg:rounded-[28px] lg:p-6"}`}>
      <span className={`hidden shrink-0 items-center justify-center rounded-2xl bg-on-accent/15 sm:inline-flex ${large ? "h-36 w-36 rounded-[28px]" : "h-14 w-14 lg:h-24 lg:w-24"}`}>
        <Music size={large ? 60 : 26} aria-hidden className="animate-pulse" />
      </span>
      <div className={`flex min-w-0 flex-1 flex-col ${large ? "gap-5" : "gap-3"}`}>
        <div className="flex items-start justify-between gap-3">
          <span className={`font-display leading-none font-extrabold ${large ? "text-7xl" : "text-2xl lg:text-5xl"}`}>Aus welchem Jahr ist der Song?</span>
          {left && (
            <span role="timer" aria-label={`Noch ${left.seconds} Sekunden`}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-bold tabular-nums ${large ? "h-16 px-6 text-3xl" : "h-9 px-3 lg:h-12 lg:px-4 lg:text-xl"} ${left.seconds <= 5 ? "bg-on-accent text-buzz" : "bg-on-accent/15"}`}>
              <Timer size={large ? 28 : 16} aria-hidden />{left.seconds}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {act && (
            // The server resumes instead of restarting when this song is already loaded
            <button onClick={() => act(isPlaying ? { type: "pause" } : { type: "play", trackId: round.trackId })}
              aria-label={isPlaying ? "Pause" : "Abspielen"}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-on-accent text-buzz">
              {isPlaying ? <Pause size={18} fill="currentColor" aria-hidden /> : <Play size={18} fill="currentColor" aria-hidden />}
            </button>
          )}
          <div className="min-w-0 flex-1">
            {progress ? <ProgressBar {...progress} thick={large} /> : <p className="text-sm">Song startet auf dem Spotify-Gerät des Hosts …</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Who has guessed already (without revealing the guesses). */
export function GuessStatus({ game, round, large }: { game: Game; round: YearRound; large?: boolean }) {
  const count = game.players.filter(p => p.id in round.guesses).length;
  return (
    <section className={`flex flex-col ${large ? "gap-4" : "gap-2"}`} aria-label="Wer hat schon getippt">
      <span className={`font-bold ${large ? "text-2xl" : ""}`}>Getippt: {count} von {game.players.length}</span>
      <ul className={`flex flex-wrap ${large ? "gap-3.5" : "gap-2"}`}>
        {game.players.map(p => {
          const done = p.id in round.guesses;
          return (
            <li key={p.id} className={`inline-flex items-center rounded-full font-medium ${large ? "h-18 gap-3.5 pr-6 pl-2 text-2xl" : "h-10 gap-2 pr-3 pl-1"} ${done ? "bg-surface-2" : "border-2 border-dashed border-surface-2 opacity-60"}`}>
              <Avatar name={p.name} color={playerColor(game, p.id)} size={large ? 52 : 32} />
              {p.name}{!done && " …"}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Year picker: big number, slider, ±1/±10 and decade shortcuts. */
export function YearPicker({ value, onChange }: { value: number; onChange: (year: number) => void }) {
  const max = thisYear();
  const set = (y: number) => onChange(Math.min(max, Math.max(1900, y)));
  const decade = Math.floor(value / 10) * 10;
  return (
    <div className="flex flex-col items-center gap-4 lg:gap-6">
      <span className="text-muted lg:text-lg">Dein Tipp</span>
      <span className="font-display text-[104px] leading-[0.9] font-extrabold tracking-tight text-primary tabular-nums lg:text-[160px]" aria-live="polite">{value}</span>
      <div className="flex w-full max-w-3xl flex-col gap-1.5">
        <label className="sr-only" htmlFor="year-slider">Jahr</label>
        <input id="year-slider" type="range" min={SLIDER_MIN} max={max} value={Math.max(SLIDER_MIN, value)}
          onChange={e => set(Number(e.target.value))} className="h-10 w-full cursor-pointer accent-[var(--primary)]" />
        <div className="flex justify-between text-sm text-muted"><span>{SLIDER_MIN}</span><span>heute</span></div>
      </div>
      <div className="grid w-full max-w-md grid-cols-4 gap-2">
        {([[-10, "−10", "↓"], [-1, "−1", "←"], [1, "+1", "→"], [10, "+10", "↑"]] as const).map(([d, label, key]) => (
          <button key={d} onClick={() => set(value + d)} aria-label={`${d > 0 ? "Plus" : "Minus"} ${Math.abs(d)} Jahr${Math.abs(d) === 1 ? "" : "e"}`}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-surface font-bold hover:brightness-125 lg:bg-surface-2">
            {label}<kbd className="hidden rounded-md border-2 border-current/25 px-1.5 text-xs opacity-80 lg:inline">{key}</kbd>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-1.5">
        {[1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020].filter(d => d <= max).map(d => (
          <button key={d} onClick={() => set(d + 5)} aria-pressed={d === decade}
            className={`h-9 rounded-full border-2 px-3 text-sm font-bold transition ${d === decade ? "border-primary bg-surface-2" : "border-surface-2 hover:border-muted"}`}>
            {String(d).slice(2)}er
          </button>
        ))}
      </div>
    </div>
  );
}

/** The revealed song: cover, year and title. */
export function SongResult({ song, large }: { song: YearSong; large?: boolean }) {
  const cover = large ? "h-52 w-52 rounded-[32px]" : "h-24 w-24 rounded-2xl lg:h-36 lg:w-36";
  return (
    <div className={`flex items-center ${large ? "gap-9" : "gap-4 lg:gap-6"}`}>
      {song.albumArt
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={song.albumArt} alt="" className={`shrink-0 object-cover shadow-2xl ${cover}`} />
        : <span className={`shrink-0 bg-surface ${cover}`} />}
      <div className="flex min-w-0 flex-col">
        <span className={`font-display leading-[0.9] font-extrabold text-primary tabular-nums ${large ? "text-[120px]" : "text-6xl lg:text-8xl"}`}>{song.year}</span>
        <span className={`truncate font-bold ${large ? "text-4xl" : "text-lg lg:text-2xl"}`}>{song.name}</span>
        <span className={`truncate text-muted ${large ? "text-2xl" : "lg:text-lg"}`}>{song.artist}</span>
      </div>
    </div>
  );
}

/** All guesses as avatars on a number line, with the correct year marked. */
export function NumberLine({ game, round, large }: { game: Game; round: YearRound; large?: boolean }) {
  const answer = round.result?.song.year;
  if (answer === undefined) return null;
  const guesses = game.players.filter(p => p.id in round.guesses).map(p => ({ player: p, year: round.guesses[p.id] }))
    .sort((a, b) => a.year - b.year);
  const years = [answer, ...guesses.map(g => g.year)];
  let from = Math.min(...years) - 3;
  let to = Math.max(...years) + 3;
  if (to - from < 20) { const pad = (20 - (to - from)) / 2; from = Math.floor(from - pad); to = Math.ceil(to + pad); }
  const left = (y: number) => `${((y - from) / (to - from)) * 100}%`;
  const size = large ? 60 : 30;
  return (
    <div className={`rounded-card bg-surface ${large ? "rounded-[28px] px-10 pt-6 pb-4" : "px-4 pt-3 pb-2"}`}>
      <div className="relative" style={{ height: large ? 200 : 96 }} aria-hidden>
        <div className="absolute inset-x-0 rounded-full bg-surface-2" style={{ top: large ? 140 : 66, height: large ? 8 : 4 }} />
        <div className="absolute rounded-full bg-primary" style={{ left: left(answer), top: 0, width: large ? 6 : 3, height: large ? 170 : 84, marginLeft: large ? -3 : -1.5 }} />
        <span className={`absolute font-extrabold text-primary ${large ? "text-2xl" : "text-xs"}`} style={{ left: left(answer), top: 0, transform: `translateX(${large ? 12 : 6}px)` }}>{answer}</span>
        {guesses.map((g, i) => (
          <span key={g.player.id} className="absolute flex flex-col items-center gap-1" style={{ left: left(g.year), top: (i % 2 ? (large ? 70 : 34) : (large ? 30 : 14)), transform: "translateX(-50%)" }}>
            <span className="rounded-full ring-bg" style={{ boxShadow: `0 0 0 ${large ? 5 : 3}px var(--surface)` }}>
              <Avatar name={g.player.name} color={playerColor(game, g.player.id)} size={size} />
            </span>
            {large && <span className="rounded-md bg-surface px-1.5 text-lg font-bold">{g.year}</span>}
          </span>
        ))}
      </div>
      <div className={`flex justify-between text-muted ${large ? "text-lg" : "text-xs"}`}><span>{from}</span><span>{to}</span></div>
    </div>
  );
}

/** Guesses sorted by distance, with the points they earned. */
export function TipList({ game, round, myId }: { game: Game; round: YearRound; myId?: string }) {
  const answer = round.result?.song.year;
  if (answer === undefined) return null;
  const rows = game.players.map(p => {
    const guess = round.guesses[p.id] as number | undefined;
    return { player: p, guess, distance: guess === undefined ? Infinity : Math.abs(guess - answer), points: round.result?.points[p.id] ?? 0 };
  }).sort((a, b) => a.distance - b.distance);
  return (
    <ol className="flex flex-col gap-1">
      {rows.map(({ player, guess, distance, points }) => (
        <li key={player.id} className={`flex h-12 items-center gap-3 rounded-xl px-2.5 ${player.id === myId ? "bg-surface-2" : ""}`}>
          <Avatar name={player.name} color={playerColor(game, player.id)} size={32} />
          <span className="flex-1 font-medium">{player.name}{player.id === myId && <span className="ml-2 text-sm text-muted">du</span>}</span>
          <span className="text-sm text-muted">
            {guess === undefined ? "kein Tipp" : distance === 0 ? `${guess} · exakt` : `${guess} · ${distance} J.`}
          </span>
          <span className={`w-9 text-right font-display text-lg font-extrabold ${points ? "text-positive" : "text-muted"}`}>{points ? `+${points}` : "0"}</span>
        </li>
      ))}
    </ol>
  );
}
