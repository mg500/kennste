"use client";

import { buzzerData, type BuzzerData, type BuzzerRound } from "@/lib/game/modes/buzzer";
import type { Game } from "@/lib/game/types";
import { nextTurnPlayer } from "@/lib/game/reducer";
import { Avatar, ProgressBar, TimerRing } from "@/components/ui/primitives";
import { usePlaybackProgress } from "@/lib/game/useGameSession";
import { findPlayer, playerColor } from "../../shared";
import type { ModeScreenProps } from "../types";
import { Cover, useCountdown } from "./parts";
import { HINT_LABELS } from "./Settings";

/** The stage of a running buzzer round on the shared big screen. Never shows unrevealed answers. */
export function BigScreen({ game, playback }: ModeScreenProps) {
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
  const next = nextTurnPlayer(game);
  const last = data.lastResult?.song && round.state === "picking" ? data.lastResult : undefined;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-8">
      <div className="flex items-center gap-4">
        <Avatar name={active.name} color={playerColor(game, active.id)} size={48} />
        <span className="text-2xl font-medium">{active.name} legt auf</span>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-12">
        <Cover track={track} hidden={!revealed && !round.revealed.cover} size={380} />

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          {round.state === "picking" && (
            <span className="animate-pulse font-display text-7xl leading-[0.95] font-extrabold">{active.name} sucht einen Song …</span>
          )}

          {round.state === "playing" && (
            <>
              <span className="font-display text-7xl leading-[0.95] font-extrabold">Wer erkennt den Song?</span>
              <div className="flex flex-wrap gap-3.5">
                {(["artist", "title", "year"] as const).filter(f => track && (f !== "year" || track.releaseYear)).map(f => (
                  round.revealed[f] ? (
                    <span key={f} className="inline-flex h-13 items-center gap-2.5 rounded-full bg-surface px-5 text-xl">
                      <span className="text-muted">{HINT_LABELS[f]}</span>
                      <strong className="text-positive-text">{f === "artist" ? track!.artist : f === "title" ? track!.name : track!.releaseYear}</strong>
                    </span>
                  ) : (
                    <span key={f} className="inline-flex h-13 items-center rounded-full border-2 border-dashed border-surface-2 px-5 text-xl text-muted">
                      {HINT_LABELS[f]} ?
                    </span>
                  )
                ))}
              </div>
            </>
          )}

          {round.state === "buzzed" && (
            <div className="flex flex-col items-start gap-6">
              {buzzLeft && (
                <TimerRing size={180} stroke={14} progress={buzzLeft.progress} color="var(--primary)">
                  <span className="font-display text-7xl font-extrabold tabular-nums">{buzzLeft.seconds}</span>
                </TimerRing>
              )}
              <div className="flex flex-col gap-2">
                <span className="font-display text-6xl leading-[0.95] font-extrabold break-words">{buzzer?.name ?? "Jemand"} hat gebuzzert!</span>
                <span className="text-2xl text-muted">{active.name} entscheidet …</span>
              </div>
            </div>
          )}

          {revealed && track && (
            <div className="flex flex-col gap-3">
              <span className="font-display text-7xl leading-[0.95] font-extrabold">{scorer ? `${scorer.name} hat's erraten!` : "Aufgelöst!"}</span>
              <span className="text-3xl">{track.name}</span>
              <span className="text-2xl text-muted">{track.artist}{track.releaseYear && ` · ${track.releaseYear}`}</span>
              {round.revealedAt && <span className="mt-3 text-2xl text-muted">{next ? <>Gleich legt <strong className="text-text">{next.name}</strong> auf …</> : "Gleich gibt's die Endwertung …"}</span>}
            </div>
          )}

          {progress && round.state !== "picking" && <ProgressBar {...progress} thick />}
        </div>
      </div>
      {(round.state === "playing" || round.state === "buzzed") && <GuesserStatus game={game} data={data} round={round} />}
      {last?.song && (
        <section aria-label="Letzter Song" className="flex items-center gap-5 rounded-3xl bg-surface p-4">
          {last.song.albumArt
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={last.song.albumArt} alt="" className="h-18 w-18 rounded-2xl object-cover" />
            : <span className="h-18 w-18 rounded-2xl bg-surface-2" />}
          <span className="flex flex-1 flex-col">
            <span className="text-lg text-muted">Letzter Song</span>
            <span className="text-2xl font-bold">{last.song.name} <span className="font-normal text-muted">· {last.song.artist}</span></span>
          </span>
          <span className="pr-3 text-xl font-bold text-positive-text">{last.type === "correct" ? `${last.byPlayerName} +1` : "nicht erraten"}</span>
        </section>
      )}
    </div>
  );
}

/** Where every guesser stands: still guessing, buzzed, wrong or skipped. */
function GuesserStatus({ game, data, round }: { game: Game; data: BuzzerData; round: BuzzerRound }) {
  const active = game.players[game.currentPlayerIndex];
  const guessers = game.players.filter(p => p.id !== active?.id);
  const status = (id: string) =>
    round.buzzedBy === id ? { label: "hat gebuzzert", tone: "bg-primary text-on-accent" }
    : round.skippedPlayers.includes(id) ? { label: "übersprungen", tone: "border-2 border-dashed border-surface-2 text-muted" }
    : (round.buzzCounts[id] ?? 0) >= data.settings.maxBuzzesPerRound ? { label: "lag falsch", tone: "bg-buzz/20 text-buzz-text" }
    : { label: "rät", tone: "bg-surface" };
  return (
    <ul className="flex flex-wrap gap-3.5" aria-label="Wer noch rät">
      {guessers.map(p => {
        const { label, tone } = status(p.id);
        return (
          <li key={p.id} className={`inline-flex h-18 items-center gap-3.5 rounded-full pr-6 pl-2 text-2xl font-medium ${tone}`}>
            <Avatar name={p.name} color={playerColor(game, p.id)} size={52} />
            {p.name}<span className="text-xl opacity-80">· {label}</span>
          </li>
        );
      })}
    </ul>
  );
}
