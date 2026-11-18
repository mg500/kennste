"use client";

import { Check, Timer, X } from "lucide-react";
import { Avatar, ProgressBar, TimerDigits } from "@/components/ui/primitives";
import { useCountdown } from "@/components/ui/useCountdown";
import { correctIndex, timelineData, timelineOf } from "@/lib/game/modes/timeline";
import { usePlaybackProgress } from "@/lib/game/useGameSession";
import { genitive, playerColor, SpotifyLink } from "../../shared";
import type { ModeScreenProps } from "../types";
import { Lives, teamLabel, votesOf } from "./coop";
import { MysteryCard, Timeline } from "./Timeline";

/** Zeitstrahl for spectators on a phone: the active player's timeline, live aim and result. */
export function Watch({ game, playback }: ModeScreenProps) {
  const data = timelineData(game);
  const round = data.round;
  const active = game.players[game.currentPlayerIndex];
  const progress = usePlaybackProgress(playback, round?.trackId);
  const timeLeft = useCountdown(data.settings.placeTimeLimit, round?.playingAt, round?.state === "listening");
  if (!round || !active) return null;

  const coop = data.settings.coop;
  const timeline = timelineOf(data, active.id);
  const result = round.state === "revealed" ? round.result : undefined;

  const header = (
    <>
      {coop && (
        <div className="flex items-center gap-2 font-bold">
          <span className="inline-flex h-9 items-center rounded-full bg-surface px-3 text-sm">{teamLabel(game)}</span>
          <span className="inline-flex h-9 items-center rounded-full bg-surface px-3"><Lives data={data} /></span>
        </div>
      )}
      <div className="flex items-center gap-3">
        <Avatar name={active.name} color={playerColor(game, active.id)} />
        <span className="text-lg font-medium">{active.name} ordnet ein</span>
      </div>
    </>
  );

  if (!result) {
    const aim = round.aim ?? null;
    return (
      <>
        {header}
        <MysteryCard size={56}>
          <div className="flex items-start justify-between gap-3">
            <span className="font-display text-2xl leading-none font-extrabold">Wann kam dieser Song raus?</span>
            {timeLeft && (
              <span role="timer" aria-label={`Noch ${timeLeft.seconds} Sekunden`}
                className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 font-bold tabular-nums ${timeLeft.seconds <= 5 ? "bg-on-accent text-buzz" : "bg-on-accent/15"}`}>
                <Timer size={16} aria-hidden /><TimerDigits left={timeLeft} />
              </span>
            )}
          </div>
          {progress && <ProgressBar {...progress} />}
        </MysteryCard>
        <section className="flex flex-col gap-2" aria-label={`Zeitstrahl von ${active.name}`}>
          <h2 className="font-bold">{coop ? "Gemeinsamer Zeitstrahl" : `${genitive(active.name)} Zeitstrahl`}</h2>
          <Timeline cards={timeline} marker={aim === null ? null : { index: aim, label: `${active.name} tippt hier`, tone: "aim" }}
            votes={coop ? votesOf(game, round) : undefined} />
        </section>
      </>
    );
  }

  const { card, correct } = result;
  const misplaced = correct ? undefined : { index: correctIndex(timeline, card.year), card, tone: "misplaced" as const };
  const wrongTip = !correct && result.index !== null ? { index: result.index, label: `${genitive(active.name)} Tipp`, tone: "wrong" as const } : null;
  const lostLife = data.livesLeft ? "ein Leben weniger" : "keine Leben mehr";
  const message = coop ? (correct ? "Richtig! Die Karte gehört dem Team." : result.index === null ? `Zeit abgelaufen – ${lostLife}.` : `Daneben – ${lostLife}.`)
    : correct ? `Richtig! Die Karte gehört ${active.name}.`
    : result.index === null ? `Zeit abgelaufen – ${active.name} geht leer aus.`
    : `Daneben – ${active.name} geht leer aus.`;
  return (
    <>
      {header}
      <div className="flex items-center gap-4">
        {card.albumArt
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={card.albumArt} alt="" className="h-24 w-24 shrink-0 rounded-2xl object-cover shadow-2xl" />
          : <span className="h-24 w-24 shrink-0 rounded-2xl bg-surface" />}
        <div className="flex min-w-0 flex-col">
          <span className="font-display text-5xl leading-none font-extrabold text-primary-text tabular-nums">{card.year}</span>
          <span className="truncate font-bold">{card.name}</span>
          <span className="truncate text-sm text-muted">{card.artist}</span>
          <SpotifyLink game={game} song={card} />
        </div>
      </div>
      <div className={`flex items-center gap-3 rounded-card p-4 font-bold text-on-accent ${correct ? "bg-positive" : "bg-buzz"}`}>
        {correct ? <Check size={22} strokeWidth={3} aria-hidden /> : <X size={22} strokeWidth={3} aria-hidden />}
        <span>{message}</span>
      </div>
      <Timeline cards={timeline} extra={misplaced} marker={wrongTip} highlightId={correct ? card.trackId : undefined} />
    </>
  );
}
