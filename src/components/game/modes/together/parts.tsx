"use client";

import { Check, X } from "lucide-react";
import { useCountdown } from "@/components/ui/useCountdown";
import type { TogetherData, TogetherRound } from "@/lib/game/modes/together";
import type { Game } from "@/lib/game/types";
import { playerColor } from "../../shared";
import { Timeline, type GapVotes } from "../timeline/Timeline";

export const PLACE_QUESTION = "Wann kam dieser Song raus?";

/** Seconds left to place (ticking), or null without limit / before the song plays. */
export function usePlaceCountdown(data: TogetherData) {
  return useCountdown(data.settings.placeTimeLimit, data.round?.playingAt, data.round?.state === "placing");
}

/** Who picked which gap – only after the reveal. */
export function picksOf(game: Game, round: TogetherRound): GapVotes {
  const votes: GapVotes = {};
  for (const p of game.players) {
    const index = round.picks[p.id];
    if (index !== undefined) (votes[index] ??= []).push({ id: p.id, name: p.name, color: playerColor(game, p.id) });
  }
  return votes;
}

/**
 * The shared timeline after the reveal: as it was, with everyone's pick in its gap and the new card where it
 * belongs.
 */
export function RevealedTimeline({ game, data, large }: { game: Game; data: TogetherData; large?: boolean }) {
  const result = data.round?.result;
  if (!result) return null;
  const before = data.timeline.filter(c => c.trackId !== result.card.trackId);
  return <Timeline cards={before} votes={picksOf(game, data.round!)} extra={{ index: result.index, card: result.card, tone: "new" }} large={large} />;
}

/** The revealed song: cover, year and title. */
export function CardResult({ data, large }: { data: TogetherData; large?: boolean }) {
  const card = data.round?.result?.card;
  if (!card) return null;
  const cover = large ? "h-44 w-44 rounded-[28px]" : "h-24 w-24 rounded-2xl lg:h-32 lg:w-32";
  return (
    <div className={`flex items-center ${large ? "gap-8" : "gap-4 lg:gap-6"}`}>
      {card.albumArt
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={card.albumArt} alt="" className={`shrink-0 object-cover shadow-2xl ${cover}`} />
        : <span className={`shrink-0 bg-surface ${cover}`} />}
      <div className="flex min-w-0 flex-col">
        <span className={`font-display leading-[0.9] font-extrabold text-primary-text tabular-nums ${large ? "text-[96px]" : "text-6xl lg:text-7xl"}`}>{card.year}</span>
        <span className={`truncate font-bold ${large ? "text-3xl" : "text-lg lg:text-2xl"}`}>{card.name}</span>
        <span className={`truncate text-muted ${large ? "text-2xl" : "lg:text-lg"}`}>{card.artist}</span>
      </div>
    </div>
  );
}

/** Who was right and who wasn't. */
export function WhoWasRight({ game, data }: { game: Game; data: TogetherData }) {
  const round = data.round;
  if (!round?.result) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Wer lag richtig">
      {game.players.map(p => {
        const points = round.result!.points[p.id] ?? 0;
        const right = points > 0;
        const none = round.picks[p.id] === undefined;
        return (
          <li key={p.id} className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-bold ${right ? "bg-positive text-on-accent" : "bg-surface text-muted"}`}>
            {right ? <Check size={16} strokeWidth={3} aria-hidden /> : <X size={16} strokeWidth={3} aria-hidden />}
            {p.name}{none ? " · nicht gelegt" : right ? ` +${points}` : ""}
          </li>
        );
      })}
    </ul>
  );
}
