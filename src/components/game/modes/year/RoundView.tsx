"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Kbd, useHotkeys } from "@/components/ui/hotkeys";
import { Card } from "@/components/ui/primitives";
import { yearData, type YearRound } from "@/lib/game/modes/year";
import type { Game } from "@/lib/game/types";
import type { GameControls } from "@/lib/game/useGameSession";
import { ScoreAside, Screen, TopBar } from "../../shared";
import type { ModeRoundProps } from "../types";
import { AnswerStatus, SongCard } from "../allplay";
import { NumberLine, SONG_QUESTION, SongResult, TipList, useGuessCountdown, YearPicker } from "./parts";
import { NextBar } from "../../Continue";
import { OutOfSongs, Verdict } from "../common";

export function RoundView({ game, controls, myId, playback, onMenu }: ModeRoundProps) {
  const data = yearData(game);
  const round = data.round;
  const isHost = game.hostPlayerId === myId;
  const left = useGuessCountdown(data);

  if (!round) return <OutOfSongs header={<TopBar game={game} onMenu={onMenu} />} />;

  const guessing = round.state === "guessing";
  const note = (id: string) => (id === myId ? "du" : guessing ? (id in round.guesses ? "getippt" : "überlegt …") : undefined);
  return (
    <Screen desktop header={<TopBar game={game} onMenu={onMenu} />}
      aside={<ScoreAside game={game} myId={myId} note={note} />}>
      {guessing
        ? <>
            <SongCard trackId={round.trackId} title={SONG_QUESTION} playback={playback} left={left} act={isHost ? controls.act : undefined} />
            <Guess key={round.trackId} game={game} round={round} myId={myId} controls={controls} />
          </>
        : <Reveal game={game} round={round} myId={myId} controls={controls} />}
    </Screen>
  );
}

function Guess({ game, round, myId, controls: { act } }: { game: Game; round: YearRound; myId: string; controls: GameControls }) {
  const isPlayer = game.players.some(p => p.id === myId);
  const isHost = game.hostPlayerId === myId;
  const submitted = round.guesses[myId] as number | undefined;
  const [year, setYear] = useState(submitted ?? round.drafts?.[myId] ?? 1990);
  const [editing, setEditing] = useState(false);
  const picking = isPlayer && (submitted === undefined || editing);
  // The year shown counts even if the player never touches the picker
  const draft = useDraft(year, act, isPlayer && submitted === undefined && round.drafts?.[myId] === undefined);
  const pick = (y: number) => { draft.touch(); setYear(y); };
  const submit = () => { draft.cancel(); act({ type: "guess", year }); setEditing(false); };
  const change = (d: number) => pick(Math.min(new Date().getFullYear(), Math.max(1900, year + d)));
  useHotkeys({
    ArrowLeft: picking && (() => change(-1)),
    ArrowRight: picking && (() => change(1)),
    ArrowDown: picking && (() => change(-10)),
    ArrowUp: picking && (() => change(10)),
    Enter: picking && submit,
  });

  const reveal = isHost && (
    <Button variant="ghost" size="sm" onClick={() => act({ type: "reveal" })} className="self-center">Jetzt auflösen</Button>
  );

  if (!isPlayer) {
    return (
      <>
        <Card className="text-center text-muted">Du schaust zu.</Card>
        <AnswerStatus game={game} answered={id => id in round.guesses} />
      </>
    );
  }

  if (picking) {
    return (
      <>
        <div className="flex flex-1 flex-col justify-center lg:rounded-[28px] lg:bg-surface lg:p-8">
          <YearPicker value={year} onChange={pick} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Button size="lg" block onClick={submit}><Check size={20} strokeWidth={3} aria-hidden />Fertig<Kbd>Enter</Kbd></Button>
          <p className="text-center text-sm text-muted">Dein eingestelltes Jahr zählt auch, wenn die Zeit um ist.</p>
        </div>
        {reveal}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center gap-2.5 text-center lg:rounded-[28px] lg:bg-surface lg:p-8">
        <span className="text-muted">Dein Tipp</span>
        <span className="font-display text-[88px] leading-[0.9] font-extrabold text-primary tabular-nums lg:text-[140px]">{submitted}</span>
        <Button variant="secondary" size="sm" onClick={() => { setYear(submitted!); setEditing(true); }}>Ändern</Button>
      </div>
      <div className="lg:hidden"><Card><AnswerStatus game={game} answered={id => id in round.guesses} /></Card></div>
      {reveal}
    </>
  );
}

/**
 * Sends the picked year as a draft shortly after the player changed it: when the time is up, it counts as
 * their guess even if they never pressed "Fertig" (or their phone is in the background by then). With
 * `sendInitial`, the starting year is sent right away as well.
 */
function useDraft(year: number, act: GameControls["act"], sendInitial: boolean) {
  const touched = useRef(sendInitial);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (!touched.current) return;
    timer.current = setTimeout(() => act({ type: "guess", year, draft: true }), 300);
    return () => clearTimeout(timer.current);
  }, [year, act]);
  return {
    touch: () => { touched.current = true; },
    cancel: () => { clearTimeout(timer.current); touched.current = false; },
  };
}

function Reveal({ game, round, myId, controls }: { game: Game; round: YearRound; myId: string; controls: GameControls }) {
  const result = round.result;
  if (!result) return null;

  const guess = round.guesses[myId] as number | undefined;
  const isPlayer = game.players.some(p => p.id === myId);
  const points = result.points[myId] ?? 0;
  const distance = guess === undefined ? 0 : Math.abs(guess - result.song.year);
  const message = guess === undefined ? "Kein Tipp abgegeben."
    : distance === 0 ? `Dein Tipp ${guess} – exakt getroffen!`
    : `Dein Tipp ${guess} – ${distance} ${distance === 1 ? "Jahr" : "Jahre"} daneben${points ? "!" : "."}`;

  return (
    <>
      <SongResult song={result.song} />
      {isPlayer && (
        <Verdict good={points > 0} points={points}
          trailing={distance === 0 && guess !== undefined && <Check size={24} strokeWidth={3} aria-hidden />}>{message}</Verdict>
      )}
      <NumberLine game={game} round={round} />
      <TipList game={game} round={round} myId={myId} />
      <div className="flex-1" />
      <NextBar game={game} controls={controls} myId={myId} />
    </>
  );
}
