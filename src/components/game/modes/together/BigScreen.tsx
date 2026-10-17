"use client";

import { togetherData } from "@/lib/game/modes/together";
import { AnswerStatus, SongCard } from "../allplay";
import { Timeline } from "../timeline/Timeline";
import type { ModeScreenProps } from "../types";
import { CardResult, PLACE_QUESTION, RevealedTimeline, usePlaceCountdown, WhoWasRight } from "./parts";

/** "Zeitstrahl für alle" on the TV: the song and who is done – never where anyone placed it before the reveal. */
export function BigScreen({ game, playback }: ModeScreenProps) {
  const data = togetherData(game);
  const round = data.round;
  const left = usePlaceCountdown(data);
  if (!round) return null;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-7">
      <span className="text-2xl font-medium">Alle legen gleichzeitig</span>
      {round.state === "placing" ? (
        <>
          <SongCard trackId={round.trackId} title={PLACE_QUESTION} playback={playback} left={left} large />
          <AnswerStatus game={game} answered={id => round.done.includes(id)} label="Fertig" large />
        </>
      ) : (
        <>
          <CardResult data={data} large />
          <WhoWasRight game={game} data={data} large />
        </>
      )}
    </div>
  );
}

/** The shared timeline over the full width of the TV. */
export function BigTimeline({ game }: ModeScreenProps) {
  const data = togetherData(game);
  if (!data.round) return null;
  return data.round.state === "revealed"
    ? <RevealedTimeline game={game} data={data} large />
    : <Timeline cards={data.timeline} large />;
}
