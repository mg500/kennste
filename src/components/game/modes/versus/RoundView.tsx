"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Kbd, useHotkeys } from "@/components/ui/hotkeys";
import { Avatar, Card, TimerRing } from "@/components/ui/primitives";
import { objectionsNeeded, versusData, type VersusData, type VersusRound } from "@/lib/game/modes/versus";
import { nextTurnPlayer } from "@/lib/game/reducer";
import type { Game, SongInfo } from "@/lib/game/types";
import type { GameControls } from "@/lib/game/useGameSession";
import { findPlayer, playerColor, ScoreAside, Screen, Standings, TopBar } from "../../shared";
import { ContinueBar } from "../../Continue";
import { SongCard } from "../allplay";
import type { ModeRoundProps } from "../types";
import { Objections, PlayerChips, QUESTION, SongBox, useLockLeft, useVersusTimers } from "./parts";

interface ViewProps { game: Game; data: VersusData; round: VersusRound; controls: GameControls; myId: string }

export function RoundView({ game, controls, myId, playback, onMenu }: ModeRoundProps) {
  const data = versusData(game);
  const round = data.round;
  const isHost = game.hostPlayerId === myId;
  const { playLeft } = useVersusTimers(data);

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

  const props: ViewProps = { game, data, round, controls, myId };
  const mine = round.buzzedBy === myId;
  return (
    <Screen desktop decor={round.state === "revealed" && round.result?.winner ? "confetti" : undefined}
      header={<TopBar game={game} onMenu={onMenu} />} aside={<ScoreAside game={game} myId={myId} />}>
      {round.state !== "revealed" && round.state !== "contest" && (
        <SongCard trackId={round.trackId} title={QUESTION} kicker="Alle gegen alle" playback={playback} left={round.state === "playing" ? playLeft : null}
          act={isHost ? controls.act : undefined} />
      )}
      {round.state !== "revealed" && <PlayerChips game={game} data={data} />}
      {round.state === "playing" ? <Listen {...props} />
        : round.state === "buzzed" ? (mine ? <MyAnswer {...props} /> : <OtherBuzzed {...props} />)
        : round.state === "contest" ? (mine ? <Checking {...props} /> : <Contest {...props} />)
        : <Reveal {...props} />}
    </Screen>
  );
}

function Listen({ game, data, round, controls: { act }, myId }: ViewProps) {
  const isPlayer = game.players.some(p => p.id === myId);
  const lockLeft = useLockLeft(data, myId);
  const used = round.buzzCounts[myId] ?? 0;
  const left = data.settings.buzzesPerSong - used;
  const skipped = round.skipped.includes(myId);
  const canBuzz = isPlayer && left > 0 && !skipped && lockLeft === 0;
  useHotkeys({
    Space: canBuzz && (() => act({ type: "buzz" })),
    s: isPlayer && !skipped && (() => act({ type: "skip" })),
  });
  if (!isPlayer) return <Card className="text-center text-muted">Du schaust zu.</Card>;
  return (
    <>
      <div className="flex-1" />
      <div className="flex flex-col items-center gap-4">
        <TimerRing size={236} stroke={10} progress={lockLeft ? lockLeft / Math.max(1, data.settings.cooldown) : 1}
          color={lockLeft ? "var(--muted)" : undefined}>
          <button onClick={() => act({ type: "buzz" })} disabled={!canBuzz}
            style={{ "--shade": "var(--buzz-shade)" } as React.CSSProperties}
            className="pressable absolute inset-[18px] flex flex-col items-center justify-center rounded-full bg-buzz font-display text-5xl font-extrabold tracking-wide text-on-accent disabled:bg-surface-2 disabled:text-muted">
            {lockLeft ? <>{lockLeft}<span className="font-sans text-sm font-bold">wieder buzzern</span></> : "BUZZ"}
          </button>
        </TimerRing>
        <span className="flex items-center gap-2 text-sm text-muted">
          {skipped ? "Du weißt es nicht – warte auf die Auflösung."
            : left <= 0 ? "Keine Buzzer mehr für diesen Song."
            : lockLeft ? "Daneben – kurz gesperrt, der Song läuft weiter."
            : `Noch ${left} Buzzer für diesen Song`}
          <Kbd className="text-text">Leertaste</Kbd>
        </span>
        <Button variant="outline" disabled={skipped} onClick={() => act({ type: "skip" })}>
          {skipped ? <><Check size={16} aria-hidden />Übersprungen</> : <>Keine Ahnung – überspringen<Kbd>S</Kbd></>}
        </Button>
      </div>
    </>
  );
}

/** The song for the player who buzzed (fetched separately – it isn't in the game state). */
function useAnswer(controls: GameControls, buzzedAt: number | undefined) {
  const [answer, setAnswer] = useState<{ at: number; song: SongInfo | null } | null>(null);
  useEffect(() => {
    if (!buzzedAt) return;
    let cancelled = false;
    void controls.api.answer().then(song => { if (!cancelled) setAnswer({ at: buzzedAt, song }); });
    return () => { cancelled = true; };
  }, [controls.api, buzzedAt]);
  return answer && answer.at === buzzedAt ? answer.song : null;
}

function MyAnswer({ data, round, controls }: ViewProps) {
  const { act } = controls;
  const { buzzLeft } = useVersusTimers(data);
  const song = useAnswer(controls, round.buzzedAt);
  useHotkeys({ r: () => act({ type: "judge", verdict: "correct" }), f: () => act({ type: "judge", verdict: "wrong" }) });
  return (
    <>
      <div className="flex items-center gap-4">
        {buzzLeft && (
          <TimerRing size={72} stroke={7} progress={buzzLeft.progress} color="var(--primary)" track="var(--surface-2)">
            <span className="font-display text-3xl font-extrabold tabular-nums">{buzzLeft.seconds}</span>
          </TimerRing>
        )}
        <div className="flex flex-col">
          <span className="font-display text-3xl font-extrabold">Du bist dran!</span>
          <span className="text-muted">Sag Titel und Interpret laut.</span>
        </div>
      </div>
      <Card className="flex flex-col gap-3 p-5">
        <span className="text-xs font-bold tracking-wider text-muted uppercase">Nur du siehst die Lösung</span>
        {song ? <SongBox song={song} /> : <span className="text-muted">Lösung wird geladen …</span>}
      </Card>
      <div className="flex-1" />
      <span className="text-center font-bold lg:text-left">Lagst du richtig?</span>
      <div className="grid grid-cols-2 gap-2.5 lg:flex lg:gap-3">
        <Button variant="buzz" size="lg" onClick={() => act({ type: "judge", verdict: "wrong" })}>
          <X size={20} strokeWidth={3} aria-hidden />Falsch<Kbd>F</Kbd>
        </Button>
        <Button variant="positive" size="lg" onClick={() => act({ type: "judge", verdict: "correct" })}>
          <Check size={20} strokeWidth={3} aria-hidden />Richtig<Kbd>R</Kbd>
        </Button>
      </div>
    </>
  );
}

function OtherBuzzed({ game, data, round }: ViewProps) {
  const { buzzLeft } = useVersusTimers(data);
  const buzzer = findPlayer(game, round.buzzedBy);
  return (
    <Card className="flex flex-col items-center gap-3 p-6 text-center">
      {buzzer && <Avatar name={buzzer.name} color={playerColor(game, buzzer.id)} size={72} />}
      <span className="font-display text-3xl font-extrabold">{buzzer?.name ?? "Jemand"} hat gebuzzert!</span>
      <span className="text-muted">{buzzer?.name ?? "Er"} antwortet und prüft selbst – du kannst gleich Einspruch erheben.</span>
      {buzzLeft && <span className="font-display text-2xl font-extrabold tabular-nums">noch {buzzLeft.seconds} s</span>}
    </Card>
  );
}

function Checking({ game, data, round }: ViewProps) {
  const { contestLeft } = useVersusTimers(data);
  return (
    <>
      <span className="font-display text-3xl font-extrabold">Die anderen prüfen …</span>
      {round.song && <SongBox song={round.song} />}
      <Objections count={round.objections.length} needed={objectionsNeeded(game)} left={contestLeft?.seconds} />
      <p className="text-muted">Ohne Einspruch der Mehrheit bekommst du den Punkt.</p>
    </>
  );
}

function Contest({ game, data, round, controls: { act }, myId }: ViewProps) {
  const { contestLeft } = useVersusTimers(data);
  const buzzer = findPlayer(game, round.buzzedBy);
  const isPlayer = game.players.some(p => p.id === myId);
  const objected = round.objections.includes(myId);
  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="font-display text-3xl font-extrabold">{buzzer?.name} sagt: richtig!</span>
        <span className="text-muted">Stimmt das? Ohne Einspruch der Mehrheit bekommt {buzzer?.name} den Punkt.</span>
      </div>
      {round.song && <Card><SongBox song={round.song} /></Card>}
      <Objections count={round.objections.length} needed={objectionsNeeded(game)} left={contestLeft?.seconds} />
      <div className="flex-1" />
      {isPlayer && (
        <Button size="lg" variant={objected ? "buzz" : "outline"} aria-pressed={objected} onClick={() => act({ type: "object", want: !objected })}>
          {objected ? "Einspruch zurücknehmen" : "Einspruch – das war falsch"}
        </Button>
      )}
    </>
  );
}

function Reveal({ game, round, controls, myId }: ViewProps) {
  const winner = findPlayer(game, round.result?.winner);
  const isLast = !nextTurnPlayer(game);
  const next = () => controls.act({ type: "next" });
  useHotkeys({ Enter: game.hostPlayerId === myId && next });
  const headline = winner ? (winner.id === myId ? "Du hast's erraten!" : `${winner.name} hat's erraten!`)
    : round.result?.overruled ? "Einspruch – kein Punkt" : "Niemand hat's erraten";
  return (
    <>
      <div role="status" className={`bubble-in flex h-15 items-center gap-3 rounded-full px-3 lg:self-start lg:pr-5 ${winner ? "bg-primary text-on-accent" : "bg-surface"}`}>
        {winner && <Avatar name={winner.name} color={playerColor(game, winner.id)} size={44} />}
        <span className="flex-1 px-2 font-display text-xl font-extrabold lg:text-3xl">{headline}</span>
        {winner && <span className="inline-flex h-11 min-w-11 items-center justify-center rounded-full bg-bg px-3 font-display text-xl font-extrabold text-primary">+1</span>}
      </div>
      {round.song && <SongBox song={round.song} />}
      <Card className="p-3 lg:hidden">
        <Standings game={game} highlight={winner ? [winner.id] : []} animate note={id => (id === myId ? "du" : undefined)} />
      </Card>
      <div className="flex-1" />
      <ContinueBar game={game} controls={controls} myId={myId} label={isLast ? "Zum Endstand" : "Nächster Song"}
        onContinue={next} className="lg:w-auto lg:self-start lg:px-9" />
    </>
  );
}
