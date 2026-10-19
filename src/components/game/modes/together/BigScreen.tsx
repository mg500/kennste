"use client";

import { togetherData } from "@/lib/game/modes/together";
import { PlayerCards, SongCard } from "../allplay";
import { Timeline } from "../timeline/Timeline";
import type { ModeScreenProps } from "../types";
import { CardResult, PLACE_QUESTION, RevealedTimeline, usePlaceCountdown } from "./parts";

/** "Zeitstrahl für alle" on the TV: the song and who is done (flat cards, the timeline below needs the room) – never where anyone placed it before the reveal. */
export function BigScreen({ game, playback }: ModeScreenProps) {
  const data = togetherData(game);
  const round = data.round;
  const left = usePlaceCountdown(data);
  if (!round) return null;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5">
      <span className="text-2xl font-medium">Alle legen gleichzeitig</span>
      {round.state === "placing"
        ? <SongCard trackId={round.trackId} title={PLACE_QUESTION} playback={playback} left={left} />
        : <CardResult data={data} large />}
      <PlayerCards game={game} flat label={round.result ? "Wer lag richtig" : "Spieler"} info={id => {
        const result = round.result;
        if (!result) return round.done.includes(id) ? { note: "fertig" } : { note: "legt …", tone: "waiting" };
        if (round.picks[id] === undefined) return { note: "nicht gelegt", tone: "waiting" };
        return result.points[id] ? { note: "richtig gelegt", tone: "right", gain: result.points[id] } : { note: "daneben" };
      }} />
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
