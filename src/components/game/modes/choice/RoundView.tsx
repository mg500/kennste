"use client";

import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useHotkeys } from "@/components/ui/hotkeys";
import { Card } from "@/components/ui/primitives";
import { choiceData, POINTS_FASTEST, type ChoiceRound } from "@/lib/game/modes/choice";
import { nextTurnPlayer } from "@/lib/game/reducer";
import type { Game } from "@/lib/game/types";
import type { GameControls } from "@/lib/game/useGameSession";
import { findPlayer, ScoreAside, Screen, TopBar } from "../../shared";
import { AnswerStatus, SongCard } from "../allplay";
import type { ModeRoundProps } from "../types";
import { Options, question, Results, SongResult, useAnswerCountdown } from "./parts";
import { ContinueBar } from "../../Continue";

export function RoundView({ game, controls, myId, playback, onMenu }: ModeRoundProps) {
  const data = choiceData(game);
  const round = data.round;
  const isHost = game.hostPlayerId === myId;
  const left = useAnswerCountdown(data);

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

  const answering = round.state === "answering";
  const note = (id: string) => (id === myId ? "du" : answering ? (id in round.answers ? "getippt" : "überlegt …") : undefined);
  return (
    <Screen desktop header={<TopBar game={game} onMenu={onMenu} />}
      aside={<ScoreAside game={game} myId={myId} note={note} />}>
      {answering
        ? <>
            <SongCard trackId={round.trackId} {...question(round)} playback={playback} left={left} act={isHost ? controls.act : undefined} />
            <Answer game={game} round={round} myId={myId} act={controls.act} />
          </>
        : <Reveal game={game} round={round} myId={myId} controls={controls} />}
    </Screen>
  );
}

function Answer({ game, round, myId, act }: { game: Game; round: ChoiceRound; myId: string; act: GameControls["act"] }) {
  const isPlayer = game.players.some(p => p.id === myId);
  const isHost = game.hostPlayerId === myId;
  const mine = round.answers[myId]?.option;
  const canPick = isPlayer && mine === undefined;
  const pick = (option: number) => act({ type: "answer", option });
  useHotkeys(Object.fromEntries(round.options.map((_, i) => [String(i + 1), canPick && (() => pick(i))])));

  return (
    <>
      <Options game={game} round={round} mine={mine} onPick={canPick ? pick : undefined} />
      {!isPlayer && <Card className="text-center text-muted">Du schaust zu.</Card>}
      {canPick && <p className="text-center text-sm text-muted lg:text-left lg:text-base">
        <span className="lg:hidden">Tippe eine Antwort an – sie zählt sofort.</span>
        <span className="hidden lg:inline">Tasten 1–{round.options.length} wählen sofort. Die erste Antwort zählt.</span>
      </p>}
      <div className="flex-1" />
      {mine !== undefined && (
        <Card className="flex flex-col gap-2 lg:hidden">
          <AnswerStatus game={game} answered={id => id in round.answers} />
          <span className="text-sm text-muted">Wer zuerst richtig liegt, bekommt einen Bonuspunkt.</span>
        </Card>
      )}
      {isHost && <Button variant="ghost" size="sm" onClick={() => act({ type: "reveal" })} className="self-center">Jetzt auflösen</Button>}
    </>
  );
}

function Reveal({ game, round, myId, controls }: { game: Game; round: ChoiceRound; myId: string; controls: GameControls }) {
  const { act } = controls;
  const isHost = game.hostPlayerId === myId;
  const isLast = !nextTurnPlayer(game);
  const next = () => act({ type: "next" });
  useHotkeys({ Enter: isHost && next });
  const result = round.result;
  if (!result) return null;

  const isPlayer = game.players.some(p => p.id === myId);
  const answered = myId in round.answers;
  const points = result.points[myId] ?? 0;
  const fastest = result.fastest === myId;
  const fastestName = findPlayer(game, result.fastest)?.name;
  const message = !answered ? "Keine Antwort abgegeben."
    : points ? (fastest ? "Richtig – und am schnellsten!" : `Richtig!${fastestName ? ` Am schnellsten war ${fastestName}.` : ""}`)
    : "Leider daneben.";

  return (
    <>
      <SongResult round={round} />
      {isPlayer && (
        <div className={`flex items-center gap-3 rounded-card p-4 font-bold text-on-accent ${points ? "bg-positive" : "bg-buzz"}`}>
          {points ? <span className="font-display text-3xl font-extrabold">+{points}</span> : <X size={24} strokeWidth={3} aria-hidden />}
          <span className="text-lg">{message}</span>
          {fastest && <span className="ml-auto hidden items-center gap-1 text-sm whitespace-nowrap lg:inline-flex"><Check size={16} strokeWidth={3} aria-hidden />+{POINTS_FASTEST} Bonus</span>}
        </div>
      )}
      <Options game={game} round={round} mine={round.answers[myId]?.option} />
      <Results game={game} round={round} myId={myId} />
      <div className="flex-1" />
      <ContinueBar game={game} controls={controls} myId={myId} label={isLast ? "Zum Endstand" : "Nächster Song"}
        onContinue={next} className="lg:w-auto lg:self-start lg:px-9" />
    </>
  );
}
