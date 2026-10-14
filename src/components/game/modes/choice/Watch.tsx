"use client";

import { Users } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { choiceData } from "@/lib/game/modes/choice";
import { AnswerStatus, SongCard } from "../allplay";
import type { ModeScreenProps } from "../types";
import { Options, question, Results, SongResult, useAnswerCountdown } from "./parts";

/** Song-Tipp for spectators on a phone. */
export function Watch({ game, playback }: ModeScreenProps) {
  const data = choiceData(game);
  const round = data.round;
  const left = useAnswerCountdown(data);
  if (!round) return null;
  return (
    <>
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface"><Users size={18} aria-hidden /></span>
        <span className="text-lg font-medium">Alle raten</span>
      </div>
      {round.state === "answering"
        ? <>
            <SongCard trackId={round.trackId} {...question(round)} playback={playback} left={left} />
            <Options game={game} round={round} />
            <Card><AnswerStatus game={game} answered={id => id in round.answers} /></Card>
          </>
        : <>
            <SongResult round={round} />
            <Options game={game} round={round} />
            <Results game={game} round={round} />
          </>}
    </>
  );
}
