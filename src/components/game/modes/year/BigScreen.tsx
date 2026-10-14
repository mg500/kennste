"use client";

import { yearData } from "@/lib/game/modes/year";
import type { ModeScreenProps } from "../types";
import { GuessStatus, NumberLine, SongCard, SongResult, useGuessCountdown } from "./parts";

/** "Jahr schätzen" on the TV view: who has guessed, then everyone's guess on a number line. */
export function BigScreen({ game, playback }: ModeScreenProps) {
  const data = yearData(game);
  const round = data.round;
  const left = useGuessCountdown(data);
  if (!round) return null;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-8">
      <span className="text-2xl font-medium">Alle schätzen</span>
      {round.state === "guessing" ? (
        <>
          <SongCard round={round} playback={playback} left={left} large />
          <GuessStatus game={game} round={round} large />
        </>
      ) : round.result && (
        <>
          <SongResult song={round.result.song} large />
          <NumberLine game={game} round={round} large />
        </>
      )}
    </div>
  );
}
