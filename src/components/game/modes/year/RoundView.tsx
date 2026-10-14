"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Kbd, useHotkeys } from "@/components/ui/hotkeys";
import { Card } from "@/components/ui/primitives";
import { yearData, type YearRound } from "@/lib/game/modes/year";
import { nextTurnPlayer } from "@/lib/game/reducer";
import type { Game } from "@/lib/game/types";
import type { GameControls } from "@/lib/game/useGameSession";
import { findPlayer, ScoreAside, Screen, TopBar } from "../../shared";
import type { ModeRoundProps } from "../types";
import { AnswerStatus, SongCard, useRoundTimeout } from "../allplay";
import { NumberLine, SONG_QUESTION, SongResult, TipList, useGuessCountdown, YearPicker } from "./parts";

export function RoundView({ game, controls, myId, playback, onMenu }: ModeRoundProps) {
  const data = yearData(game);
  const round = data.round;
  const isHost = game.hostPlayerId === myId;
  const left = useGuessCountdown(data);
  useRoundTimeout(round?.state === "guessing", round?.trackId, left, isHost, controls.act);

  if (!round) {
    return (
      <Screen desktop header={<TopBar game={game} onMenu={onMenu} />}>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <h1 className="font-display text-3xl font-extrabold">Keine Songs mehr</h1>
          <p className="text-muted">Die Playlist ist durchgespielt. Der Host kann das Spiel im Menü beenden.</p>
        </div>
      </Screen>
    );
  }

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
        : <Reveal game={game} round={round} myId={myId} act={controls.act} />}
    </Screen>
  );
}

function Guess({ game, round, myId, controls: { act } }: { game: Game; round: YearRound; myId: string; controls: GameControls }) {
  const isPlayer = game.players.some(p => p.id === myId);
  const isHost = game.hostPlayerId === myId;
  const submitted = round.guesses[myId] as number | undefined;
  const [year, setYear] = useState(submitted ?? 1990);
  const [editing, setEditing] = useState(false);
  const picking = isPlayer && (submitted === undefined || editing);
  const submit = () => { act({ type: "guess", year }); setEditing(false); };
  const change = (d: number) => setYear(y => Math.min(new Date().getFullYear(), Math.max(1900, y + d)));
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
          <YearPicker value={year} onChange={setYear} />
        </div>
        <Button size="lg" block onClick={submit}>{year} tippen<Kbd>Enter</Kbd></Button>
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

function Reveal({ game, round, myId, act }: { game: Game; round: YearRound; myId: string; act: GameControls["act"] }) {
  const isHost = game.hostPlayerId === myId;
  const host = findPlayer(game, game.hostPlayerId);
  const isLast = !nextTurnPlayer(game);
  const next = () => act({ type: "next" });
  useHotkeys({ Enter: isHost && next });
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
        <div className={`flex items-center gap-3 rounded-card p-4 font-bold text-on-accent ${points ? "bg-positive" : "bg-buzz"}`}>
          {points ? <span className="font-display text-3xl font-extrabold">+{points}</span> : <X size={24} strokeWidth={3} aria-hidden />}
          <span className="text-lg">{message}</span>
          {distance === 0 && guess !== undefined && <Check size={24} strokeWidth={3} aria-hidden className="ml-auto" />}
        </div>
      )}
      <NumberLine game={game} round={round} />
      <TipList game={game} round={round} myId={myId} />
      <div className="flex-1" />
      {isHost
        ? <Button size="lg" block onClick={next} className="lg:w-auto lg:self-start lg:px-9">{isLast ? "Zum Endstand" : "Nächster Song"}<Kbd>Enter</Kbd></Button>
        : <p className="animate-pulse text-center text-muted">Warte auf {host?.name ?? "den Host"} …</p>}
    </>
  );
}
