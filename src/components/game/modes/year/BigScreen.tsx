"use client";

import { yearData } from "@/lib/game/modes/year";
import type { ModeScreenProps } from "../types";
import { AnswerStatus, SongCard } from "../allplay";
import { NumberLine, SONG_QUESTION, SongResult, useGuessCountdown } from "./parts";

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
          <SongCard trackId={round.trackId} title={SONG_QUESTION} playback={playback} left={left} large />
          <AnswerStatus game={game} answered={id => id in round.guesses} large />
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
