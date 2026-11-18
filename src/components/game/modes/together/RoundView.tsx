"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Kbd, useHotkeys } from "@/components/ui/hotkeys";
import { Card } from "@/components/ui/primitives";
import { togetherData, type TogetherData, type TogetherRound } from "@/lib/game/modes/together";
import type { Game } from "@/lib/game/types";
import type { GameControls } from "@/lib/game/useGameSession";
import { findPlayer, ScoreAside, Screen, TopBar } from "../../shared";
import { NextBar } from "../../Continue";
import { OutOfSongs, Verdict } from "../common";
import { AnswerStatus, SongCard } from "../allplay";
import { Timeline } from "../timeline/Timeline";
import type { ModeRoundProps } from "../types";
import { CardResult, PLACE_QUESTION, RevealedTimeline, usePlaceCountdown, whereItBelongs } from "./parts";

export function RoundView({ game, controls, myId, playback, onMenu }: ModeRoundProps) {
  const data = togetherData(game);
  const round = data.round;
  const isHost = game.hostPlayerId === myId;
  const left = usePlaceCountdown(data);

  if (!round) return <OutOfSongs header={<TopBar game={game} myId={myId} onMenu={onMenu} />} />;

  const placing = round.state === "placing";
  const note = (id: string) => (id === myId ? "du" : placing ? (round.done.includes(id) ? "fertig" : "legt …") : undefined);
  return (
    <Screen desktop header={<TopBar game={game} myId={myId} onMenu={onMenu} />} aside={<ScoreAside game={game} myId={myId} note={note} />}>
      {placing
        ? <>
            <SongCard trackId={round.trackId} title={PLACE_QUESTION} kicker="Alle legen gleichzeitig" playback={playback} left={left} act={isHost ? controls.act : undefined} />
            <Place key={round.trackId} game={game} data={data} round={round} myId={myId} controls={controls} />
          </>
        : <Reveal game={game} data={data} round={round} myId={myId} controls={controls} />}
    </Screen>
  );
}

function Place({ game, data, round, myId, controls: { act } }: { game: Game; data: TogetherData; round: TogetherRound; myId: string; controls: GameControls }) {
  const isPlayer = game.players.some(p => p.id === myId);
  const isHost = game.hostPlayerId === myId;
  const done = round.done.includes(myId);
  const [pick, setPick] = useState<number | null>(round.picks[myId] ?? null);
  const max = data.timeline.length;
  // Every tap goes to the server right away: the last picked gap counts when the time is up
  const choose = (index: number) => { setPick(index); act({ type: "pick", index }); };
  const finish = () => { if (pick !== null) act({ type: "pick", index: pick, done: true }); };
  useHotkeys({
    ArrowLeft: isPlayer && !done && (() => choose(Math.max(0, (pick ?? 1) - 1))),
    ArrowRight: isPlayer && !done && (() => choose(Math.min(max, (pick ?? -1) + 1))),
    Enter: isPlayer && !done && pick !== null && finish,
  });
  const reveal = isHost && (
    <Button variant="ghost" size="sm" onClick={() => act({ type: "reveal" })} className="self-center">Jetzt auflösen</Button>
  );
  const status = <AnswerStatus game={game} answered={id => round.done.includes(id)} label="Fertig" />;

  if (!isPlayer) return <><Card className="text-center text-muted">Du schaust zu.</Card>{status}</>;
  return (
    <>
      <div className="lg:rounded-[28px] lg:bg-surface lg:p-6">
        <Timeline cards={data.timeline} selected={pick} onSelect={done ? undefined : choose} selectedLabel={done ? "Dein Tipp" : "Hier"}
          marker={done && pick !== null ? { index: pick, label: "Dein Tipp", tone: "aim" } : null} />
      </div>
      <div className="flex-1" />
      <div className="lg:hidden"><Card>{status}</Card></div>
      {/* Fixed at the bottom on phones: the timeline grows longer than the screen */}
      <div className="h-28 shrink-0 lg:hidden" aria-hidden />
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-md flex-col gap-1.5 bg-bg px-5 pt-3 pb-6 shadow-[0_-16px_24px_var(--bg)] lg:static lg:mx-0 lg:max-w-none lg:bg-transparent lg:p-0 lg:shadow-none">
        {done ? (
          <Card className="flex items-center gap-3">
            <span className="flex-1">Fertig – warte auf die anderen …</span>
            <Button variant="secondary" size="sm" onClick={() => choose(pick ?? 0)}>Ändern</Button>
          </Card>
        ) : (
          <>
            <Button size="lg" block disabled={pick === null} onClick={finish}><Check size={20} strokeWidth={3} aria-hidden />Fertig<Kbd>Enter</Kbd></Button>
            <p className="text-center text-sm text-muted">{pick === null ? "Tipp die passende Lücke an." : "Deine Lücke zählt auch bei Zeitablauf."}</p>
          </>
        )}
      </div>
      {reveal}
    </>
  );
}

function Reveal({ game, data, round, myId, controls }: { game: Game; data: TogetherData; round: TogetherRound; myId: string; controls: GameControls }) {
  const result = round.result;
  if (!result) return null;
  const isPlayer = game.players.some(p => p.id === myId);
  const points = result.points[myId] ?? 0;
  const right = points > 0;
  const placed = round.picks[myId] !== undefined;
  const fastestName = findPlayer(game, result.fastest)?.name;
  const speed = result.fastest === myId ? "Und am schnellsten!" : fastestName ? `Am schnellsten war ${fastestName}.` : "Deine Lücke war die richtige.";

  return (
    <>
      {isPlayer && (
        <Verdict good={right} points={points} detail={right ? speed : `Er gehört ${whereItBelongs(data)}.`}>
          {right ? "Richtig gelegt!" : placed ? "Daneben" : "Nicht gelegt"}
        </Verdict>
      )}
      <CardResult data={data} game={game} />
      <RevealedTimeline game={game} data={data} myId={myId} />
      <div className="flex-1" />
      <NextBar game={game} controls={controls} myId={myId} />
    </>
  );
}
