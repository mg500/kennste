"use client";

import { Check, Music, X } from "lucide-react";
import { Avatar, ProgressBar } from "@/components/ui/primitives";
import { correctIndex, hitsterData, type HitsterCard } from "@/lib/game/modes/hitster";
import { usePlaybackProgress } from "@/lib/game/useGameSession";
import { playerColor } from "../../shared";
import type { ModeScreenProps } from "../types";

function BigCard({ card, tone }: { card: HitsterCard; tone?: "new" | "misplaced" }) {
  return (
    <li className={`flex w-40 shrink-0 flex-col gap-2 rounded-3xl p-4 ${tone === "new" ? "bg-positive text-on-accent" : tone === "misplaced" ? "border-4 border-dashed border-buzz" : "bg-surface"}`}>
      <span className="font-display text-5xl font-extrabold tabular-nums">{card.year}</span>
      <span className="line-clamp-2 font-bold leading-tight">{card.name}</span>
      <span className={`line-clamp-1 text-sm ${tone === "new" ? "" : "text-muted"}`}>{card.artist}</span>
    </li>
  );
}

/** Hitster on the big screen: the active player's timeline and the song being placed. */
export function BigScreen({ game, playback }: ModeScreenProps) {
  const data = hitsterData(game);
  const round = data.round;
  const active = game.players[game.currentPlayerIndex];
  const progress = usePlaybackProgress(playback, round?.trackId);
  if (!round || !active) return null;

  const timeline = data.timelines[active.id] ?? [];
  const result = round.state === "revealed" ? round.result : undefined;
  const misplacedAt = result && !result.correct ? correctIndex(timeline, result.card.year) : -1;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-8">
      <div className="flex items-center gap-4">
        <Avatar name={active.name} color={playerColor(game, active.id)} size={48} />
        <span className="text-2xl font-medium">{active.name} ordnet ein</span>
      </div>

      {result ? (
        <div className="flex items-center gap-8">
          {result.card.albumArt
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={result.card.albumArt} alt="" className="h-48 w-48 rounded-3xl object-cover shadow-2xl" />
            : <span className="h-48 w-48 rounded-3xl bg-surface" />}
          <div className="flex min-w-0 flex-col gap-2">
            <span className="font-display text-8xl leading-none font-extrabold text-primary">{result.card.year}</span>
            <span className="truncate text-3xl font-bold">{result.card.name}</span>
            <span className="truncate text-2xl text-muted">{result.card.artist}</span>
          </div>
          <span className={`ml-auto inline-flex h-24 w-24 shrink-0 items-center justify-center rounded-full ${result.correct ? "bg-positive" : "bg-buzz"} text-on-accent`}>
            {result.correct ? <Check size={56} strokeWidth={3} aria-label="Richtig" /> : <X size={56} strokeWidth={3} aria-label="Falsch" />}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-8 rounded-[32px] bg-buzz p-6 text-on-accent">
          <span className="inline-flex h-32 w-32 shrink-0 items-center justify-center rounded-3xl bg-on-accent/15">
            <Music size={56} className="animate-pulse" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <span className="font-display text-6xl leading-none font-extrabold">Wann kam dieser Song raus?</span>
            {progress && <ProgressBar {...progress} thick />}
          </div>
        </div>
      )}

      <ol className="flex flex-wrap gap-3" aria-label={`Zeitstrahl von ${active.name}`}>
        {timeline.map((card, i) => (
          <BigCardWithMisplaced key={card.trackId} card={card} showMisplacedBefore={misplacedAt === i ? result?.card : undefined}
            tone={result?.correct && card.trackId === result.card.trackId ? "new" : undefined} />
        ))}
        {misplacedAt === timeline.length && result && <BigCard card={result.card} tone="misplaced" />}
      </ol>
    </div>
  );
}

function BigCardWithMisplaced({ card, tone, showMisplacedBefore }: { card: HitsterCard; tone?: "new"; showMisplacedBefore?: HitsterCard }) {
  return (
    <>
      {showMisplacedBefore && <BigCard card={showMisplacedBefore} tone="misplaced" />}
      <BigCard card={card} tone={tone} />
    </>
  );
}
