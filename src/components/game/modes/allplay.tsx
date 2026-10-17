"use client";

// Building blocks for modes where everyone plays every round at once ("Jahr schätzen", "Song-Tipp").

import { Music, Pause, Play, Timer } from "lucide-react";
import { Avatar, ProgressBar, TimerDigits } from "@/components/ui/primitives";
import type { useCountdown } from "@/components/ui/useCountdown";
import type { Game } from "@/lib/game/types";
import type { GameControls, ReceivedPlayback } from "@/lib/game/useGameSession";
import { usePlaybackProgress } from "@/lib/game/useGameSession";
import { playerColor } from "../shared";

type Countdown = ReturnType<typeof useCountdown>;

/** The question card with countdown and playback progress; play/pause for the host. */
export function SongCard({ trackId, title, kicker, playback, left, act, large }: {
  trackId: string; title: string; kicker?: string; playback: ReceivedPlayback | null; left: Countdown;
  act?: GameControls["act"]; large?: boolean;
}) {
  const progress = usePlaybackProgress(playback, trackId);
  const isPlaying = progress?.isPlaying ?? false;
  return (
    <div className={`flex items-center gap-4 rounded-card bg-buzz text-on-accent ${large ? "gap-8 rounded-[36px] p-8" : "p-4 lg:gap-6 lg:rounded-[28px] lg:p-6"}`}>
      <span className={`hidden shrink-0 items-center justify-center rounded-2xl bg-on-accent/15 sm:inline-flex ${large ? "h-36 w-36 rounded-[28px]" : "h-14 w-14 lg:h-24 lg:w-24"}`}>
        <Music size={large ? 60 : 26} aria-hidden className="animate-pulse" />
      </span>
      <div className={`flex min-w-0 flex-1 flex-col ${large ? "gap-5" : "gap-3"}`}>
        <div className="flex items-start justify-between gap-3">
          <span className="flex min-w-0 flex-col gap-1">
            {kicker && <span className={`font-bold tracking-wider uppercase opacity-75 ${large ? "text-lg" : "text-xs lg:text-sm"}`}>{kicker}</span>}
            <span className={`font-display leading-none font-extrabold ${large ? "text-7xl" : "text-2xl lg:text-5xl"}`}>{title}</span>
          </span>
          {left && (
            <span role="timer" aria-label={`Noch ${left.seconds} Sekunden`}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-bold tabular-nums ${large ? "h-16 px-6 text-3xl" : "h-9 px-3 lg:h-12 lg:px-4 lg:text-xl"} ${left.seconds <= 5 ? "bg-on-accent text-buzz" : "bg-on-accent/15"}`}>
              <Timer size={large ? 28 : 16} aria-hidden /><TimerDigits left={left} />
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {act && (
            // The server resumes instead of restarting when this song is already loaded
            <button onClick={() => act(isPlaying ? { type: "pause" } : { type: "play", trackId })}
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

/** Who has answered already (without revealing the answers). */
export function AnswerStatus({ game, answered, large }: { game: Game; answered: (playerId: string) => boolean; large?: boolean }) {
  const count = game.players.filter(p => answered(p.id)).length;
  return (
    <section className={`flex flex-col ${large ? "gap-4" : "gap-2"}`} aria-label="Wer hat schon getippt">
      <span className={`font-bold ${large ? "text-2xl" : ""}`}>Getippt: {count} von {game.players.length}</span>
      <ul className={`flex flex-wrap ${large ? "gap-3.5" : "gap-2"}`}>
        {game.players.map(p => {
          const done = answered(p.id);
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
