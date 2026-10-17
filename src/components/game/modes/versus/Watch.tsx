"use client";

import { Users } from "lucide-react";
import { objectionsNeeded, versusData } from "@/lib/game/modes/versus";
import { findPlayer } from "../../shared";
import { SongCard } from "../allplay";
import type { ModeScreenProps } from "../types";
import { Objections, PlayerChips, QUESTION, SongBox, useVersusTimers } from "./parts";

/** "Alle gegen alle" for spectators on a phone. */
export function Watch({ game, playback }: ModeScreenProps) {
  const data = versusData(game);
  const round = data.round;
  const { playLeft, contestLeft } = useVersusTimers(data);
  if (!round) return null;
  const buzzer = findPlayer(game, round.buzzedBy);
  const winner = findPlayer(game, round.result?.winner);
  return (
    <>
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface"><Users size={18} aria-hidden /></span>
        <span className="text-lg font-medium">Alle gegen alle</span>
      </div>
      {round.state === "playing" && <SongCard trackId={round.trackId} title={QUESTION} playback={playback} left={playLeft} />}
      {round.state === "buzzed" && <p className="font-display text-2xl font-extrabold">{buzzer?.name} hat gebuzzert!</p>}
      {round.state === "contest" && round.song && (
        <>
          <p className="font-display text-2xl font-extrabold">{buzzer?.name} sagt: richtig!</p>
          <SongBox song={round.song} />
          <Objections count={round.objections.length} needed={objectionsNeeded(game)} left={contestLeft?.seconds} />
        </>
      )}
      {round.state === "revealed" && (
        <>
          <p className="font-display text-2xl font-extrabold">{winner ? `${winner.name} hat's erraten!` : round.result?.overruled ? "Einspruch – kein Punkt" : "Niemand hat's erraten"}</p>
          {round.song && <SongBox song={round.song} />}
        </>
      )}
      {round.state !== "revealed" && <PlayerChips game={game} data={data} />}
    </>
  );
}
