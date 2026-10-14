"use client";

import { choiceData } from "@/lib/game/modes/choice";
import { findPlayer } from "../../shared";
import { AnswerStatus, SongCard } from "../allplay";
import type { ModeScreenProps } from "../types";
import { Options, question, SongResult, useAnswerCountdown } from "./parts";

/** Song-Tipp on the TV view: the question and options, then the right answer and everyone's picks. */
export function BigScreen({ game, playback }: ModeScreenProps) {
  const data = choiceData(game);
  const round = data.round;
  const left = useAnswerCountdown(data);
  if (!round) return null;
  const fastest = findPlayer(game, round.result?.fastest);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-7">
      <span className="text-2xl font-medium">Alle raten</span>
      {round.state === "answering"
        ? <SongCard trackId={round.trackId} {...question(round)} playback={playback} left={left} large />
        : <div className="flex flex-col gap-3">
            <SongResult round={round} large />
            {fastest && <span className="text-2xl text-muted">{fastest.name} war am schnellsten</span>}
          </div>}
      <Options game={game} round={round} large />
      {round.state === "answering" && <AnswerStatus game={game} answered={id => id in round.answers} large />}
    </div>
  );
}
