"use client";

import { useState } from "react";
import { Avatar, TimerRing } from "@/components/ui/primitives";
import { versusData } from "@/lib/game/modes/versus";
import { findPlayer, playerColor } from "../../shared";
import { PlayerCards, SongCard } from "../allplay";
import type { ModeScreenProps } from "../types";
import { QUESTION, resultHeadline, SongBox, useVersusTimers, versusCard, VoteTally } from "./parts";

/** "Alle gegen alle" on the TV: who buzzed and who may still – the song only once it's claimed or revealed, with everyone's vote. */
export function BigScreen({ game, playback }: ModeScreenProps) {
  const data = versusData(game);
  const round = data.round;
  const { playLeft, buzzLeft } = useVersusTimers(data);
  const [now] = useState(() => Date.now());
  if (!round) return null;
  const buzzer = findPlayer(game, round.buzzedBy);
  const winner = findPlayer(game, round.result?.winner);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6">
      <span className="text-2xl font-medium">Alle gegen alle</span>
      <div className="flex flex-1 flex-col justify-center gap-6">
        {round.state === "playing" && <SongCard trackId={round.trackId} title={QUESTION} playback={playback} left={playLeft} large />}
        {round.state === "buzzed" && (
          <div className="flex items-center gap-14">
            {buzzLeft && (
              <TimerRing size={360} stroke={26} progress={buzzLeft.progress} color="var(--primary)">
                <span className="font-display text-[180px] font-extrabold tabular-nums">{buzzLeft.seconds}</span>
              </TimerRing>
            )}
            <div className="flex flex-col gap-5">
              {buzzer && <Avatar name={buzzer.name} color={playerColor(game, buzzer.id)} size={112} />}
              <span className="font-display text-[104px] leading-[0.92] font-extrabold">{buzzer?.name ?? "Jemand"} hat gebuzzert!</span>
              <span className="text-3xl text-muted">{buzzer?.name} antwortet – gut zuhören.</span>
            </div>
          </div>
        )}
        {round.state === "judging" && (
          <div className="flex items-center gap-14">
            {buzzer && <span className="rounded-full ring-[18px] ring-surface"><Avatar name={buzzer.name} color={playerColor(game, buzzer.id)} size={260} /></span>}
            <div className="flex flex-col gap-5">
              <span className="font-display text-[104px] leading-[0.92] font-extrabold">{buzzer?.name ?? "Jemand"} prüft die Antwort …</span>
              <span className="text-3xl text-muted">Nur {buzzer?.name} sieht die Lösung. Sagt {buzzer?.name} „richtig“, stimmt ihr ab.</span>
            </div>
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
      </div>
      <PlayerCards game={game} info={id => versusCard(game, data, id, now)} />
    </div>
  );
}
