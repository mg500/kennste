"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/primitives";
import { useCountdown } from "@/components/ui/useCountdown";
import { CONTEST_MS, type VersusData, type VersusRound } from "@/lib/game/modes/versus";
import type { Game, SongInfo } from "@/lib/game/types";
import { playerColor } from "../../shared";

export const QUESTION = "Wer erkennt ihn zuerst?";

/** The running timers of a round: until the reveal, to answer, to object. */
export function useVersusTimers(data: VersusData) {
  const round = data.round;
  const s = data.settings;
  return {
    playLeft: useCountdown(s.playTimeLimit, round?.playingAt, round?.state === "playing"),
    buzzLeft: useCountdown(s.answerTime, round?.buzzedAt, round?.state === "buzzed"),
    contestLeft: useCountdown(CONTEST_MS / 1000, round?.claimAt, round?.state === "contest"),
  };
}

/** Seconds a player is still locked after a wrong answer (ticking), or 0. */
export function useLockLeft(data: VersusData, playerId: string) {
  const until = data.round?.lockedUntil[playerId] ?? 0;
  const [now, setNow] = useState(() => Date.now());
  const locked = until > now;
  useEffect(() => {
    if (!locked) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [locked]);
  return locked ? Math.ceil((until - now) / 1000) : 0;
}

type Status = { label: string; tone: string };

function statusOf(data: VersusData, round: VersusRound, playerId: string, now: number): Status {
  if (round.buzzedBy === playerId && (round.state === "buzzed" || round.state === "contest")) return { label: "buzzert", tone: "bg-primary text-on-accent" };
  if (round.state === "contest" && round.objections.includes(playerId)) return { label: "Einspruch", tone: "border-2 border-buzz text-buzz" };
  if (round.skipped.includes(playerId)) return { label: "weiß nicht", tone: "border-2 border-dashed border-surface-2 text-muted" };
  if ((round.buzzCounts[playerId] ?? 0) >= data.settings.buzzesPerSong) return { label: "keine Buzzer mehr", tone: "border-2 border-dashed border-surface-2 text-muted" };
  if ((round.lockedUntil[playerId] ?? 0) > now) return { label: "gesperrt", tone: "border-2 border-dashed border-surface-2 text-muted" };
  return { label: "", tone: "bg-surface" };
}

/** Where every player stands in this song. */
export function PlayerChips({ game, data, large }: { game: Game; data: VersusData; large?: boolean }) {
  const round = data.round;
  const [now] = useState(() => Date.now());
  if (!round) return null;
  return (
    <ul className={`flex flex-wrap ${large ? "gap-3.5" : "gap-1.5"}`} aria-label="Wer noch buzzern kann">
      {game.players.map(p => {
        const { label, tone } = statusOf(data, round, p.id, now);
        return (
          <li key={p.id} className={`inline-flex items-center rounded-full font-medium ${large ? "h-16 gap-3 pr-6 pl-2 text-2xl" : "h-9 gap-1.5 pr-3 pl-1 text-sm"} ${tone}`}>
            <Avatar name={p.name} color={playerColor(game, p.id)} size={large ? 48 : 28} />
            {p.name}{label && <span className="opacity-80">· {label}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** A song: cover, title and artist. */
export function SongBox({ song, large, caption }: { song: SongInfo; large?: boolean; caption?: string }) {
  const cover = large ? "h-52 w-52 rounded-[32px]" : "h-24 w-24 rounded-2xl lg:h-36 lg:w-36";
  return (
    <div className={`flex items-center ${large ? "gap-9" : "gap-4 lg:gap-6"}`}>
      {song.albumArt
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={song.albumArt} alt="" className={`shrink-0 object-cover shadow-2xl ${cover}`} />
        : <span className={`shrink-0 bg-surface-2 ${cover}`} />}
      <div className="flex min-w-0 flex-col gap-1">
        {caption && <span className={`font-bold tracking-wider text-muted uppercase ${large ? "text-lg" : "text-xs"}`}>{caption}</span>}
        <span className={`font-display leading-tight font-extrabold ${large ? "text-6xl" : "text-2xl lg:text-4xl"}`}>{song.name}</span>
        <span className={`text-muted ${large ? "text-3xl" : "lg:text-xl"}`}>{song.artist}{song.releaseYear && ` · ${song.releaseYear.slice(0, 4)}`}</span>
      </div>
    </div>
  );
}

/** How many object to the "right", and how many are needed. */
export function Objections({ count, needed, left, large }: { count: number; needed: number; left?: number; large?: boolean }) {
  return (
    <div className={`flex flex-col ${large ? "gap-3" : "gap-1.5"}`}>
      <div className={`flex justify-between text-muted ${large ? "text-2xl" : "text-sm"}`}>
        <span>Einspruch: <strong className="text-text">{count}</strong> von {needed} nötig</span>
        {left !== undefined && <span className="tabular-nums">noch {left} s</span>}
      </div>
      <div className={`overflow-hidden rounded-full bg-surface-2 ${large ? "h-3" : "h-2.5"}`}>
        <div className="h-full rounded-full bg-buzz transition-all" style={{ width: `${Math.min(100, (count / needed) * 100)}%` }} />
      </div>
    </div>
  );
}
