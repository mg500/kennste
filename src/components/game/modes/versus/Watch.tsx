"use client";

import { Users } from "lucide-react";
import { versusData } from "@/lib/game/modes/versus";
import { findPlayer } from "../../shared";
import { SongCard } from "../allplay";
import type { ModeScreenProps } from "../types";
import { PlayerChips, QUESTION, resultHeadline, SongBox, useVersusTimers, VoteTally } from "./parts";

/** "Alle gegen alle" for spectators on a phone. */
export function Watch({ game, playback }: ModeScreenProps) {
  const data = versusData(game);
  const round = data.round;
  const { playLeft } = useVersusTimers(data);
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
      {round.state === "judging" && <p className="font-display text-2xl font-extrabold">{buzzer?.name} prüft die Antwort …</p>}
      {round.state === "vote" && round.song && (
        <>
          <p className="font-display text-2xl font-extrabold">{buzzer?.name} sagt: richtig!</p>
          <SongBox song={round.song} game={game} />
          <VoteTally game={game} round={round} />
        </>
      )}
      {round.state === "revealed" && (
        <>
          <p className="font-display text-2xl font-extrabold">{resultHeadline(round, winner?.name)}</p>
          {round.song && <SongBox song={round.song} game={game} />}
        </>
      )}
      {(round.state !== "revealed" || round.buzzedBy) && <PlayerChips game={game} data={data} />}
    </>
  );
}
