"use client";

import { ArrowRight, Check, Music, Timer, X } from "lucide-react";
import { Avatar, ProgressBar } from "@/components/ui/primitives";
import { useCountdown } from "@/components/ui/useCountdown";
import { correctIndex, timelineData, timelineOf, type TimelineCard } from "@/lib/game/modes/timeline";
import { usePlaybackProgress } from "@/lib/game/useGameSession";
import { playerColor } from "../../shared";
import type { ModeScreenProps } from "../types";
import { Lives, teamLabel, votesOf } from "./coop";
import type { GapVotes } from "./Timeline";

function BigCard({ card, tone }: { card: TimelineCard; tone?: "new" | "misplaced" }) {
  return (
    <li className={`flex w-40 shrink-0 flex-col gap-2 rounded-3xl p-4 ${tone === "new" ? "bg-positive text-on-accent" : tone === "misplaced" ? "border-4 border-dashed border-positive" : "bg-surface"}`}>
      <span className="font-display text-5xl font-extrabold tabular-nums">{card.year}</span>
      <span className="line-clamp-2 font-bold leading-tight">{card.name}</span>
      <span className={`line-clamp-1 text-sm ${tone === "new" ? "" : "text-muted"}`}>{card.artist}</span>
    </li>
  );
}

/** Zeitstrahl on the big screen: the active player's timeline and the song being placed. */
export function BigScreen({ game, playback }: ModeScreenProps) {
  const data = timelineData(game);
  const round = data.round;
  const active = game.players[game.currentPlayerIndex];
  const progress = usePlaybackProgress(playback, round?.trackId);
  const timeLeft = useCountdown(data.settings.placeTimeLimit, round?.playingAt, round?.state === "listening");
  if (!round || !active) return null;

  const coop = data.settings.coop;
  const timeline = timelineOf(data, active.id);
  const votes: GapVotes = coop && !round.result ? votesOf(game, round) : {};
  const voteChip = (i: number) => markerAt !== i && votes[i]?.length ? <BigVotes key={`v${i}`} voters={votes[i]} /> : null;
  const result = round.state === "revealed" ? round.result : undefined;
  const misplacedAt = result && !result.correct ? correctIndex(timeline, result.card.year) : -1;
  // Live: where the active player is pointing. Revealed and wrong: where they put it.
  const markerAt = result ? (!result.correct && result.index !== null ? result.index : -1) : round.aim ?? -1;
  const marker = result
    ? <BigMarker label={`${active.name} hat hier getippt`} tone="wrong" />
    : <BigMarker label={`${active.name} tippt hier`} tone="aim" />;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-8">
      {coop && (
        <div className="flex items-center gap-4">
          <span className="inline-flex h-14 items-center rounded-full bg-surface px-6 text-2xl font-extrabold">{teamLabel(game)}</span>
          <span className="inline-flex h-14 items-center rounded-full bg-surface px-5"><Lives data={data} size={30} /></span>
        </div>
      )}
      <div className="flex items-center gap-4">
        <Avatar name={active.name} color={playerColor(game, active.id)} size={48} />
        <span className="text-2xl font-medium">{active.name} ordnet ein{coop && " – das Team berät"}</span>
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
            <div className="flex items-start justify-between gap-6">
              <span className="font-display text-6xl leading-none font-extrabold">Wann kam dieser Song raus?</span>
              {timeLeft && (
                <span role="timer" className={`inline-flex h-16 shrink-0 items-center gap-2 rounded-full px-6 text-3xl font-extrabold tabular-nums ${timeLeft.seconds <= 5 ? "bg-on-accent text-buzz" : "bg-on-accent/15"}`}>
                  <Timer size={28} aria-hidden />{timeLeft.seconds}
                </span>
              )}
            </div>
            {progress && <ProgressBar {...progress} thick />}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex justify-between text-sm font-bold uppercase tracking-wider text-muted">
          <span>Älter</span>
          <span className="flex items-center gap-1.5">Neuer<ArrowRight size={16} aria-hidden /></span>
        </div>
        <ol className="flex flex-wrap gap-3" aria-label={`${coop ? "Gemeinsamer Zeitstrahl" : `Zeitstrahl von ${active.name}`}, älteste Karte zuerst`}>
          {timeline.map((card, i) => (
            <BigCardWithMisplaced key={card.trackId} card={card}
              before={<>{markerAt === i && marker}{voteChip(i)}{misplacedAt === i && result && <BigCard card={result.card} tone="misplaced" />}</>}
              tone={result?.correct && card.trackId === result.card.trackId ? "new" : undefined} />
          ))}
          {markerAt === timeline.length && marker}
          {voteChip(timeline.length)}
          {misplacedAt === timeline.length && result && <BigCard card={result.card} tone="misplaced" />}
        </ol>
      </div>
    </div>
  );
}

function BigCardWithMisplaced({ card, tone, before }: { card: TimelineCard; tone?: "new"; before?: React.ReactNode }) {
  return (
    <>
      {before}
      <BigCard card={card} tone={tone} />
    </>
  );
}

function BigVotes({ voters }: { voters: GapVotes[number] }) {
  return (
    <li aria-label={`Vorschlag von ${voters.map(v => v.name).join(", ")}`}
      className="flex w-28 shrink-0 items-center justify-center rounded-3xl border-4 border-dashed border-muted">
      <span className="flex -space-x-2">
        {voters.map(v => <span key={v.id} className="rounded-full ring-4 ring-bg"><Avatar name={v.name} color={v.color} size={40} /></span>)}
      </span>
    </li>
  );
}

function BigMarker({ label, tone }: { label: string; tone: "aim" | "wrong" }) {
  return (
    <li className={`flex w-32 shrink-0 items-center justify-center rounded-3xl border-4 border-dashed p-3 text-center text-lg font-bold ${tone === "aim" ? "animate-pulse border-primary bg-primary/15 text-primary" : "border-buzz bg-buzz/15 text-buzz"}`}>
      {label}
    </li>
  );
}
