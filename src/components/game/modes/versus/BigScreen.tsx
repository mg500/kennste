"use client";

import { Avatar, TimerRing } from "@/components/ui/primitives";
import { versusData } from "@/lib/game/modes/versus";
import { findPlayer, playerColor } from "../../shared";
import { SongCard } from "../allplay";
import type { ModeScreenProps } from "../types";
import { PlayerChips, QUESTION, resultHeadline, SongBox, useVersusTimers, VoteTally } from "./parts";

/** "Alle gegen alle" on the TV: who buzzed and who may still – the song only once it's claimed or revealed, with everyone's vote. */
export function BigScreen({ game, playback }: ModeScreenProps) {
  const data = versusData(game);
  const round = data.round;
  const { playLeft, buzzLeft } = useVersusTimers(data);
  if (!round) return null;
  const buzzer = findPlayer(game, round.buzzedBy);
  const winner = findPlayer(game, round.result?.winner);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-8">
      <span className="text-2xl font-medium">Alle gegen alle</span>
      {round.state === "playing" && <SongCard trackId={round.trackId} title={QUESTION} playback={playback} left={playLeft} large />}
      {round.state === "buzzed" && (
        <div className="flex items-center gap-8">
          {buzzLeft && (
            <TimerRing size={180} stroke={14} progress={buzzLeft.progress} color="var(--primary)">
              <span className="font-display text-7xl font-extrabold tabular-nums">{buzzLeft.seconds}</span>
            </TimerRing>
          )}
          <div className="flex flex-col gap-2">
            <span className="font-display text-7xl leading-[0.95] font-extrabold">{buzzer?.name ?? "Jemand"} hat gebuzzert!</span>
            <span className="text-2xl text-muted">{buzzer?.name} antwortet – gut zuhören.</span>
          </div>
        </div>
      )}
      {round.state === "judging" && (
        <div className="flex flex-col gap-2">
          <span className="font-display text-7xl leading-[0.95] font-extrabold">{buzzer?.name ?? "Jemand"} prüft die Antwort …</span>
          <span className="text-2xl text-muted">Nur {buzzer?.name} sieht die Lösung. Sagt {buzzer?.name} „richtig“, stimmt ihr ab.</span>
        </div>
      )}
      {round.state === "vote" && round.song && (
        <>
          <span className="inline-flex h-16 items-center self-start rounded-full bg-primary px-7 font-display text-3xl font-extrabold text-on-accent">{buzzer?.name} sagt: richtig! Stimmt das?</span>
          <SongBox song={round.song} large />
          <VoteTally game={game} round={round} large />
        </>
      )}
      {round.state === "revealed" && (
        <>
          <span className={`inline-flex h-18 items-center gap-4 self-start rounded-full pr-8 pl-3 font-display text-4xl font-extrabold ${winner ? "bg-primary text-on-accent" : "bg-surface"}`}>
            {winner && <Avatar name={winner.name} color={playerColor(game, winner.id)} size={56} />}
            {resultHeadline(round, winner?.name)}{winner && " +1"}
          </span>
          {round.song && <SongBox song={round.song} large />}
        </>
      )}
      {(round.state !== "revealed" || round.buzzedBy) && <PlayerChips game={game} data={data} large />}
    </div>
  );
}
