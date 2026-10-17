"use client";

import { Users } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { togetherData } from "@/lib/game/modes/together";
import { AnswerStatus, SongCard } from "../allplay";
import { Timeline } from "../timeline/Timeline";
import type { ModeScreenProps } from "../types";
import { CardResult, PLACE_QUESTION, RevealedTimeline, usePlaceCountdown, WhoWasRight } from "./parts";

/** "Zeitstrahl für alle" for spectators on a phone. Picks stay hidden until the song is revealed. */
export function Watch({ game, playback }: ModeScreenProps) {
  const data = togetherData(game);
  const round = data.round;
  const left = usePlaceCountdown(data);
  if (!round) return null;
  return (
    <>
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface"><Users size={18} aria-hidden /></span>
        <span className="text-lg font-medium">Alle legen gleichzeitig</span>
      </div>
      {round.state === "placing" ? (
        <>
          <SongCard trackId={round.trackId} title={PLACE_QUESTION} playback={playback} left={left} />
          <Card><AnswerStatus game={game} answered={id => round.done.includes(id)} label="Fertig" /></Card>
          <Timeline cards={data.timeline} />
        </>
      ) : (
        <>
          <CardResult data={data} />
          <WhoWasRight game={game} data={data} />
          <RevealedTimeline game={game} data={data} />
        </>
      )}
    </>
  );
}
