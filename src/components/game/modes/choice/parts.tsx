"use client";

import { Check } from "lucide-react";
import { Avatar } from "@/components/ui/primitives";
import { useCountdown } from "@/components/ui/useCountdown";
import type { ChoiceData, ChoiceRound } from "@/lib/game/modes/choice";
import type { Game } from "@/lib/game/types";
import { playerColor } from "../../shared";

const BADGES = ["bg-primary", "bg-info", "bg-positive", "bg-buzz"];

/** Seconds left to answer (ticking), or null without limit / before the song plays. */
export function useAnswerCountdown(data: ChoiceData) {
  return useCountdown(data.settings.answerTimeLimit, data.round?.playingAt, data.round?.state === "answering");
}

export function question(round: ChoiceRound) {
  return round.field === "title"
    ? { kicker: "Titel gesucht", title: "Welcher Song läuft?" }
    : { kicker: "Interpret gesucht", title: "Wer singt das?" };
}

/**
 * The answer options. With `onPick` they are buttons; `mine` marks the own answer; once revealed the
 * right one is highlighted and everyone's picks are shown.
 */
export function Options({ game, round, onPick, mine, large }: {
  game: Game; round: ChoiceRound; onPick?: (option: number) => void; mine?: number; large?: boolean;
}) {
  const correct = round.result?.correct;
  const revealed = correct !== undefined;
  return (
    <ul className={`grid gap-2.5 ${large ? "grid-cols-2 gap-4" : "lg:grid-cols-2 lg:gap-4"}`}>
      {round.options.map((label, i) => {
        const isMine = mine === i;
        const isRight = revealed && i === correct;
        const voters = revealed ? game.players.filter(p => round.answers[p.id]?.option === i) : [];
        const dim = revealed ? !isRight && voters.length === 0 : mine !== undefined && !isMine;
        const content = (
          <>
            <span aria-hidden className={`inline-flex shrink-0 items-center justify-center rounded-xl font-extrabold text-on-accent ${BADGES[i]} ${large ? "h-14 w-14 rounded-2xl text-2xl" : "h-10 w-10 text-lg"}`}>{i + 1}</span>
            <span className={`min-w-0 flex-1 font-bold leading-tight ${large ? "text-2xl" : "text-lg lg:text-2xl"}`}>{label}</span>
            {voters.length > 0 && (
              <span className="flex -space-x-1.5">
                {voters.map(p => (
                  <span key={p.id} className="rounded-full ring-2 ring-surface" title={p.name}>
                    <Avatar name={p.name} color={playerColor(game, p.id)} size={large ? 48 : 28} />
                  </span>
                ))}
              </span>
            )}
            {isRight && <Check size={large ? 36 : 22} strokeWidth={3} className="shrink-0 text-positive" aria-label="Richtig" />}
          </>
        );
        const cls = `flex w-full items-center gap-3.5 rounded-[20px] border-[3px] text-left transition ${large ? "min-h-22 gap-5 rounded-[28px] border-4 px-6 py-4" : "min-h-18 px-3.5 py-2.5 lg:min-h-36 lg:rounded-[28px] lg:px-6"} ${isRight ? "border-positive bg-surface-2" : isMine ? "border-primary bg-surface-2" : "border-transparent bg-surface"} ${dim ? "opacity-45" : ""}`;
        return (
          <li key={i}>
            {onPick
              ? <button onClick={() => onPick(i)} aria-pressed={isMine} className={`${cls} hover:brightness-110`} aria-label={`${i + 1}: ${label}`}>{content}</button>
              : <div className={cls}>{content}</div>}
          </li>
        );
      })}
    </ul>
  );
}

/** Cover, title and artist of the revealed song. */
export function SongResult({ round, large }: { round: ChoiceRound; large?: boolean }) {
  const song = round.result?.song;
  if (!song) return null;
  const cover = large ? "h-40 w-40 rounded-[28px]" : "h-22 w-22 rounded-2xl lg:h-32 lg:w-32";
  return (
    <div className={`flex items-center ${large ? "gap-8" : "gap-4 lg:gap-6"}`}>
      {song.albumArt
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={song.albumArt} alt="" className={`shrink-0 object-cover shadow-2xl ${cover}`} />
        : <span className={`shrink-0 bg-surface ${cover}`} />}
      <div className="flex min-w-0 flex-col gap-1">
        <span className={`font-display leading-tight font-extrabold ${large ? "text-6xl" : "text-2xl lg:text-5xl"}`}>{song.name}</span>
        <span className={`text-muted ${large ? "text-2xl" : "lg:text-xl"}`}>{song.artist}{song.releaseYear && ` · ${song.releaseYear.slice(0, 4)}`}</span>
      </div>
    </div>
  );
}

/** Points and answer times per player, best first; on the TV larger, with who didn't answer. */
export function Results({ game, round, myId }: { game: Game; round: ChoiceRound; myId?: string }) {
  const result = round.result;
  if (!result) return null;
  const seconds = (at: number) => round.playingAt ? `${((at - round.playingAt) / 1000).toFixed(1).replace(".", ",")} s` : "";
  const rows = [...game.players].sort((a, b) => (result.points[b.id] ?? 0) - (result.points[a.id] ?? 0)
    || (round.answers[a.id]?.at ?? Infinity) - (round.answers[b.id]?.at ?? Infinity));
  return (
    <ol className="grid grid-cols-2 gap-1.5 lg:grid-cols-4" aria-label="Alle Antworten">
      {rows.map(p => {
        const answer = round.answers[p.id];
        const pts = result.points[p.id] ?? 0;
        return (
          <li key={p.id} className={`flex h-11 items-center gap-2 rounded-xl px-2.5 ${p.id === myId ? "bg-surface-2" : "bg-surface"}`}>
            <Avatar name={p.name} color={playerColor(game, p.id)} size={26} />
            <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
            <span className="text-xs text-muted tabular-nums">{answer ? seconds(answer.at) : "–"}</span>
            <span className={`font-display font-extrabold ${pts ? "text-positive" : "text-muted"}`}>{pts ? `+${pts}` : "0"}</span>
          </li>
        );
      })}
    </ol>
  );
}
