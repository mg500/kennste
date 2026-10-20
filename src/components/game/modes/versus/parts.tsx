"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/primitives";
import { useCountdown } from "@/components/ui/useCountdown";
import { confirmsNeeded, type VersusData, type VersusRound } from "@/lib/game/modes/versus";
import type { Game, SongInfo } from "@/lib/game/types";
import type { CardInfo } from "../allplay";
import { playerColor } from "../../shared";

export const QUESTION = "Wer erkennt ihn zuerst?";

/** The running timers of a round: until the reveal, to answer. */
export function useVersusTimers(data: VersusData) {
  const round = data.round;
  const s = data.settings;
  return {
    playLeft: useCountdown(s.playTimeLimit, round?.playingAt, round?.state === "playing"),
    buzzLeft: useCountdown(s.answerTime, round?.buzzedAt, round?.state === "buzzed"),
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
  if (round.state === "revealed" && round.result?.winner === playerId) return { label: "+1", tone: "bg-positive text-on-accent" };
  if (round.buzzedBy === playerId && round.state !== "playing") return { label: "buzzert", tone: "bg-primary text-on-accent" };
  if (round.state === "vote" || (round.state === "revealed" && round.buzzedBy)) {
    const vote = round.votes[playerId];
    return vote === true ? { label: "stimmt", tone: "border-2 border-positive text-positive-text" }
      : vote === false ? { label: "stimmt nicht", tone: "border-2 border-buzz text-buzz-text" }
      : round.state === "vote" ? { label: "offen", tone: "border-2 border-dashed border-surface-2 text-muted" }
      : { label: "", tone: "bg-surface" };
  }
  if (round.skipped.includes(playerId)) return { label: "weiß nicht", tone: "border-2 border-dashed border-surface-2 text-muted" };
  if ((round.buzzCounts[playerId] ?? 0) >= data.settings.buzzesPerSong) return { label: "keine Buzzer mehr", tone: "border-2 border-dashed border-surface-2 text-muted" };
  if ((round.lockedUntil[playerId] ?? 0) > now) return { label: "gesperrt", tone: "border-2 border-dashed border-surface-2 text-muted" };
  return { label: "", tone: "bg-surface" };
}

/** A player card on the TV: buzzes left, buzzing, or their vote; after the reveal who got the point. */
export function versusCard(game: Game, data: VersusData, playerId: string, now: number): CardInfo {
  const round = data.round;
  if (!round) return {};
  const gain = round.state === "revealed" && round.result?.winner === playerId ? 1 : 0;
  if (gain) return { note: "hat's erraten", tone: "right", gain };
  if (round.buzzedBy === playerId && round.state !== "playing") return { note: "buzzert", tone: "active" };
  if (round.state === "vote" || (round.state === "revealed" && round.buzzedBy)) {
    const vote = round.votes[playerId];
    return vote === true ? { note: "stimmt", tone: "right" } : vote === false ? { note: "stimmt nicht", tone: "wrong" }
      : round.state === "vote" ? { note: "offen", tone: "waiting" } : {};
  }
  if (round.skipped.includes(playerId)) return { note: "weiß nicht", tone: "waiting" };
  const left = data.settings.buzzesPerSong - (round.buzzCounts[playerId] ?? 0);
  if (left <= 0) return { note: "keine Buzzer mehr", tone: "waiting" };
  if ((round.lockedUntil[playerId] ?? 0) > now) return { note: "gesperrt", tone: "waiting" };
  return { note: left === 1 ? "noch 1 Buzzer" : `noch ${left} Buzzer` };
}

/** Where every player stands in this song. */
export function PlayerChips({ game, data }: { game: Game; data: VersusData }) {
  const round = data.round;
  const [now] = useState(() => Date.now());
  if (!round) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Stand der Spieler">
      {game.players.map(p => {
        const { label, tone } = statusOf(data, round, p.id, now);
        return (
          <li key={p.id} className={`inline-flex h-9 items-center gap-1.5 rounded-full pr-3 pl-1 text-sm font-medium ${tone}`}>
            <Avatar name={p.name} color={playerColor(game, p.id)} size={28} />
            {p.name}{label && <span className="opacity-80">· {label}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** A song: cover, title and artist. */
export function SongBox({ song, large, caption }: { song: SongInfo; large?: boolean; caption?: string }) {
  const cover = large ? "h-64 w-64 rounded-[40px]" : "h-24 w-24 rounded-2xl lg:h-36 lg:w-36";
  return (
    <div className={`flex items-center ${large ? "gap-9" : "gap-4 lg:gap-6"}`}>
      {song.albumArt
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={song.albumArt} alt="" className={`shrink-0 object-cover shadow-2xl ${cover}`} />
        : <span className={`shrink-0 bg-surface-2 ${cover}`} />}
      <div className="flex min-w-0 flex-col gap-1">
        {caption && <span className={`font-bold tracking-wider text-muted uppercase ${large ? "text-lg" : "text-xs"}`}>{caption}</span>}
        <span className={`font-display font-extrabold ${large ? "text-7xl leading-[0.95]" : "text-2xl leading-tight lg:text-4xl"}`}>{song.name}</span>
        <span className={`text-muted ${large ? "text-3xl" : "lg:text-xl"}`}>{song.artist}{song.releaseYear && ` · ${song.releaseYear.slice(0, 4)}`}</span>
      </div>
    </div>
  );
}

/** How many of the others confirmed the "right", and how many are needed. */
export function VoteTally({ game, round, large }: { game: Game; round: VersusRound; large?: boolean }) {
  const confirms = Object.values(round.votes).filter(Boolean).length;
  const others = game.players.filter(p => p.id !== round.buzzedBy).length;
  const needed = confirmsNeeded(game);
  return (
    <div className={`flex flex-col ${large ? "gap-3" : "gap-1.5"}`}>
      <div className={`flex justify-between text-muted ${large ? "text-2xl" : "text-sm"}`}>
        <span>Bestätigt: <strong className="text-text">{confirms}</strong> von {others}</span>
        <span>Punkt ab {needed}</span>
      </div>
      <div className={`overflow-hidden rounded-full bg-surface-2 ${large ? "h-3" : "h-2.5"}`}>
        <div className="h-full rounded-full bg-positive transition-all" style={{ width: `${Math.min(100, (confirms / needed) * 100)}%` }} />
      </div>
    </div>
  );
}

/** Headline of a revealed song. */
export function resultHeadline(round: VersusRound, winnerName: string | undefined, myId?: string): string {
  if (winnerName) return round.result?.winner === myId ? "Du hast's erraten!" : `${winnerName} hat's erraten!`;
  return round.result?.rejected ? "Nicht bestätigt – kein Punkt" : "Niemand hat's erraten";
}
