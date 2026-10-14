"use client";

import { Users } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { yearData } from "@/lib/game/modes/year";
import type { ModeScreenProps } from "../types";
import { GuessStatus, NumberLine, SongCard, SongResult, TipList, useGuessCountdown } from "./parts";

/** "Jahr schätzen" for spectators on a phone. Guesses stay hidden until the song is revealed. */
export function Watch({ game, playback }: ModeScreenProps) {
  const data = yearData(game);
  const round = data.round;
  const left = useGuessCountdown(data);
  if (!round) return null;
  return (
    <>
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface"><Users size={18} aria-hidden /></span>
        <span className="text-lg font-medium">Alle schätzen</span>
      </div>
      {round.state === "guessing" ? (
        <>
          <SongCard round={round} playback={playback} left={left} />
          <Card><GuessStatus game={game} round={round} /></Card>
        </>
      ) : round.result && (
        <>
          <SongResult song={round.result.song} />
          <NumberLine game={game} round={round} />
          <TipList game={game} round={round} />
        </>
      )}
    </>
  );
}
