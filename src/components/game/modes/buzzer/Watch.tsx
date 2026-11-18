"use client";

import { buzzerData } from "@/lib/game/modes/buzzer";
import { Avatar, ProgressBar, TimerRing } from "@/components/ui/primitives";
import { usePlaybackProgress } from "@/lib/game/useGameSession";
import { findPlayer, playerColor, SpotifyLink } from "../../shared";
import type { ModeScreenProps } from "../types";
import { Cover, useCountdown } from "./parts";
import { HINT_LABELS } from "./Settings";

/** A running buzzer round for spectators on a phone. Never shows unrevealed answers. */
export function Watch({ game, playback }: ModeScreenProps) {
  const data = buzzerData(game);
  const round = data.round;
  const active = game.players[game.currentPlayerIndex];
  const progress = usePlaybackProgress(playback, round?.track?.id);
  const buzzLeft = useCountdown(data.settings.buzzTimeLimit, round?.buzzedAt, round?.state === "buzzed");
  if (!round || !active) return null;

  const track = round.track;
  const buzzer = findPlayer(game, round.buzzedBy);
  const scorer = data.lastResult?.type === "correct" ? findPlayer(game, data.lastResult.byPlayerId) : undefined;
  const revealed = round.state === "revealed";

  return (
    <>
      <div className="flex items-center gap-3">
        <Avatar name={active.name} color={playerColor(game, active.id)} />
        <span className="text-lg font-medium">{active.name} legt auf</span>
      </div>

      <div className="relative self-center">
        <Cover track={track} hidden={!revealed && !round.revealed.cover} size={260} />
        {round.state === "buzzed" && buzzLeft && (
          <span className="absolute inset-0 flex items-center justify-center rounded-[40px] bg-surface">
            <TimerRing size={140} stroke={12} progress={buzzLeft.progress} color="var(--primary)" track="color-mix(in srgb, var(--bg) 50%, transparent)">
              <span role="timer" className="font-display text-6xl font-extrabold tabular-nums">{buzzLeft.seconds}</span>
            </TimerRing>
          </span>
        )}
      </div>

      {round.state === "picking" && (
        <span className="animate-pulse font-display text-4xl leading-[0.95] font-extrabold">{active.name} sucht einen Song …</span>
      )}

      {round.state === "playing" && (
        <>
          <span className="font-display text-4xl leading-[0.95] font-extrabold">Wer erkennt den Song?</span>
          <div className="flex flex-wrap gap-2">
            {(["artist", "title", "year"] as const).filter(f => track && (f !== "year" || track.releaseYear)).map(f => (
              round.revealed[f] ? (
                <span key={f} className="inline-flex h-10 max-w-full items-center gap-2 rounded-full bg-surface px-3.5">
                  <span className="text-muted">{HINT_LABELS[f]}</span>
                  <strong className="truncate text-positive-text">{f === "artist" ? track!.artist : f === "title" ? track!.name : track!.releaseYear}</strong>
                </span>
              ) : (
                <span key={f} className="inline-flex h-10 items-center rounded-full border-2 border-dashed border-surface-2 px-3.5 text-muted">
                  {HINT_LABELS[f]} ?
                </span>
              )
            ))}
          </div>
        </>
      )}

      {round.state === "buzzed" && (
        <div className="flex flex-col gap-1.5">
          <span className="font-display text-4xl leading-[0.95] font-extrabold break-words">{buzzer?.name ?? "Jemand"} hat gebuzzert!</span>
          <span className="text-muted">{active.name} entscheidet …</span>
        </div>
      )}

      {revealed && track && (
        <div className="flex flex-col gap-1">
          <span className="font-display text-4xl leading-[0.95] font-extrabold">{scorer ? `${scorer.name} hat's erraten!` : "Aufgelöst!"}</span>
          <span className="mt-1.5 text-xl font-bold">{track.name}</span>
          <span className="text-muted">{track.artist}{track.releaseYear && ` · ${track.releaseYear}`}</span>
          <SpotifyLink game={game} song={track} />
        </div>
      )}

      {progress && round.state !== "picking" && <ProgressBar {...progress} />}
    </>
  );
}
