"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Kbd, useHotkeys } from "@/components/ui/hotkeys";
import { Avatar, Card, TimerRing } from "@/components/ui/primitives";
import { hasBuzzed, versusData, type VersusData, type VersusRound } from "@/lib/game/modes/versus";
import type { Game, SongInfo } from "@/lib/game/types";
import type { GameControls } from "@/lib/game/useGameSession";
import { findPlayer, playerColor, ScoreAside, Screen, Standings, TopBar } from "../../shared";
import { NextBar } from "../../Continue";
import { OutOfSongs } from "../common";
import { SongCard } from "../allplay";
import type { ModeRoundProps } from "../types";
import { PlayerChips, QUESTION, resultHeadline, SongBox, useVersusTimers, VoteTally } from "./parts";

interface ViewProps { game: Game; data: VersusData; round: VersusRound; controls: GameControls; myId: string }

export function RoundView({ game, controls, myId, playback, onMenu }: ModeRoundProps) {
  const data = versusData(game);
  const round = data.round;
  const isHost = game.hostPlayerId === myId;
  const { playLeft } = useVersusTimers(data);

  if (!round) return <OutOfSongs header={<TopBar game={game} myId={myId} onMenu={onMenu} />} />;

  const props: ViewProps = { game, data, round, controls, myId };
  const mine = round.buzzedBy === myId;
  return (
    <Screen desktop decor={round.state !== "revealed" ? "corner" : round.result?.winner ? "confetti" : undefined}
      header={<TopBar game={game} myId={myId} onMenu={onMenu} />} aside={<ScoreAside game={game} myId={myId} />}>
      {(round.state === "playing" || round.state === "buzzed" || round.state === "judging") && (
        <SongCard trackId={round.trackId} title={QUESTION} kicker="Alle gegen alle" playback={playback} left={round.state === "playing" ? playLeft : null}
          act={isHost ? controls.act : undefined} />
      )}
      {round.state !== "revealed" && <PlayerChips game={game} data={data} />}
      {round.state === "playing" ? <Listen {...props} />
        : round.state === "buzzed" ? (mine ? <MyAnswer {...props} /> : <OtherBuzzed {...props} />)
        : round.state === "judging" ? (mine ? <MyJudgement {...props} /> : <OtherBuzzed {...props} />)
        : round.state === "vote" ? (mine ? <Waiting {...props} /> : <Vote {...props} />)
        : <Reveal {...props} />}
    </Screen>
  );
}

function Listen({ game, round, controls: { act }, myId }: ViewProps) {
  const isPlayer = game.players.some(p => p.id === myId);
  const buzzed = hasBuzzed(round, myId);
  const skipped = round.skipped.includes(myId);
  // "Keine Ahnung" only says so – whoever remembers the song after all may still buzz
  const canBuzz = isPlayer && !buzzed;
  useHotkeys({
    Space: canBuzz && (() => act({ type: "buzz" })),
    s: canBuzz && !skipped && (() => act({ type: "skip" })),
  });
  if (!isPlayer) return <Card className="text-center text-muted">Du schaust zu.</Card>;
  return (
    <>
      <div className="flex-1" />
      <div className="flex flex-col items-center gap-4">
        <TimerRing size={236} stroke={10} progress={1} color={buzzed ? "var(--muted)" : undefined}>
          <button onClick={() => act({ type: "buzz" })} disabled={!canBuzz}
            style={{ "--shade": "var(--buzz-shade)" } as React.CSSProperties}
            className="pressable absolute inset-[18px] flex flex-col items-center justify-center rounded-full bg-buzz font-display text-5xl font-extrabold tracking-wide text-on-accent disabled:bg-surface-2 disabled:text-muted">
            BUZZ
          </button>
        </TimerRing>
        <span className="flex items-center gap-2 text-sm text-muted">
          {buzzed ? "Daneben – bei diesem Song bist du raus."
            : skipped ? "Fällt er dir doch noch ein? Buzzern geht weiter."
            : "Ein Buzzer pro Song"}
          {canBuzz && <Kbd className="text-text">Leertaste</Kbd>}
        </span>
        {!buzzed && (
          <Button variant="outline" disabled={skipped} onClick={() => act({ type: "skip" })}>
            {skipped ? <><Check size={16} aria-hidden />Weiß ich nicht</> : <>Keine Ahnung<Kbd>S</Kbd></>}
          </Button>
        )}
      </div>
    </>
  );
}

/** The song for the player who buzzed, once they answered (fetched separately – it isn't in the game state). */
function useAnswer(controls: GameControls, judgingAt: number | undefined) {
  const [answer, setAnswer] = useState<{ at: number; song: SongInfo | null } | null>(null);
  useEffect(() => {
    if (!judgingAt) return;
    let cancelled = false;
    void controls.api.answer().then(song => { if (!cancelled) setAnswer({ at: judgingAt, song }); });
    return () => { cancelled = true; };
  }, [controls.api, judgingAt]);
  return answer && answer.at === judgingAt ? answer.song : null;
}

/** Just buzzed: answer out loud – the song only shows afterwards, so nobody can read it off. */
function MyAnswer({ data, controls: { act } }: ViewProps) {
  const { buzzLeft } = useVersusTimers(data);
  const done = () => act({ type: "answered" });
  useHotkeys({ Enter: done });
  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        {buzzLeft && (
          <TimerRing size={220} stroke={14} progress={buzzLeft.progress} color="var(--primary)">
            <span className="font-display text-8xl font-extrabold tabular-nums">{buzzLeft.seconds}</span>
          </TimerRing>
        )}
        <div className="flex flex-col gap-1.5">
          <span className="font-display text-4xl font-extrabold">Du bist dran!</span>
          <span className="text-muted">Sag Titel und Interpret laut.<br />Danach siehst du die Lösung.</span>
        </div>
      </div>
      <Button variant="secondary" size="lg" onClick={done} className="lg:self-center lg:px-9">Gesagt – Lösung zeigen<Kbd>Enter</Kbd></Button>
    </>
  );
}

function MyJudgement({ round, controls }: ViewProps) {
  const { act } = controls;
  const song = useAnswer(controls, round.judgingAt);
  useHotkeys({ r: () => act({ type: "judge", verdict: "correct" }), f: () => act({ type: "judge", verdict: "wrong" }) });
  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="font-display text-3xl font-extrabold">Lagst du richtig?</span>
        <span className="text-muted">Nur du siehst die Lösung.</span>
      </div>
      <Card className="flex flex-col gap-3 p-5">
        {song ? <SongBox song={song} /> : <span className="text-muted">Lösung wird geladen …</span>}
      </Card>
      <div className="flex-1" />
      <div className="grid grid-cols-2 gap-2.5 lg:flex lg:gap-3">
        <Button variant="buzz" size="lg" onClick={() => act({ type: "judge", verdict: "wrong" })}>
          <X size={20} strokeWidth={3} aria-hidden />Falsch<Kbd>F</Kbd>
        </Button>
        <Button variant="positive" size="lg" onClick={() => act({ type: "judge", verdict: "correct" })}>
          <Check size={20} strokeWidth={3} aria-hidden />Richtig<Kbd>R</Kbd>
        </Button>
      </div>
      <p className="text-center text-sm text-muted lg:text-left">„Richtig“ müssen die anderen bestätigen.</p>
    </>
  );
}

function OtherBuzzed({ game, data, round }: ViewProps) {
  const { buzzLeft } = useVersusTimers(data);
  const buzzer = findPlayer(game, round.buzzedBy);
  const name = buzzer?.name ?? "Jemand";
  return (
    <Card className="flex flex-col items-center gap-3 p-6 text-center">
      {buzzer && <Avatar name={buzzer.name} color={playerColor(game, buzzer.id)} size={72} />}
      {round.state === "buzzed"
        ? <>
            <span className="font-display text-3xl font-extrabold">{name} hat gebuzzert!</span>
            <span className="text-muted">Hör gut zu – sagt {name} „richtig“, entscheidet ihr, ob es stimmt.</span>
            {buzzLeft && <span className="font-display text-2xl font-extrabold tabular-nums">noch {buzzLeft.seconds} s</span>}
          </>
        : <>
            <span className="font-display text-3xl font-extrabold">{name} prüft die Antwort …</span>
            <span className="text-muted">Nur {name} sieht die Lösung. Sagt {name} „richtig“, stimmt ihr ab.</span>
          </>}
    </Card>
  );
}

/** Said "right": the others vote, there's nothing to do but wait. */
function Waiting({ game, round, controls: { act }, myId }: ViewProps) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="font-display text-3xl font-extrabold">Die anderen stimmen ab</span>
        <span className="text-muted">Bestätigt die Mehrheit, bekommst du den Punkt.</span>
      </div>
      {round.song && <Card><SongBox song={round.song} /></Card>}
      <VoteTally game={game} round={round} />
      <div className="flex-1" />
      {game.hostPlayerId === myId && <HostDecides act={act} />}
    </>
  );
}

function Vote({ game, round, controls: { act }, myId }: ViewProps) {
  const buzzer = findPlayer(game, round.buzzedBy);
  const isPlayer = game.players.some(p => p.id === myId);
  const mine = round.votes[myId] as boolean | undefined;
  const vote = (confirm: boolean) => act({ type: "vote", confirm: mine === confirm ? null : confirm });
  useHotkeys({ r: isPlayer && (() => vote(true)), f: isPlayer && (() => vote(false)) });
  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="font-display text-3xl font-extrabold">{buzzer?.name} sagt: richtig!</span>
        <span className="text-muted">Hatte {buzzer?.name} das gesagt? Die Mehrheit entscheidet.</span>
      </div>
      {round.song && <Card><SongBox song={round.song} /></Card>}
      <VoteTally game={game} round={round} />
      <div className="flex-1" />
      {isPlayer && (
        <>
          <div className="grid grid-cols-2 gap-2.5 lg:flex lg:gap-3">
            <Button size="lg" variant={mine === false ? "buzz" : "outline"} aria-pressed={mine === false} onClick={() => vote(false)} className="px-3! whitespace-nowrap">
              <X size={20} strokeWidth={3} aria-hidden />Stimmt nicht<Kbd>F</Kbd>
            </Button>
            <Button size="lg" variant={mine === true ? "positive" : "outline"} aria-pressed={mine === true} onClick={() => vote(true)} className="px-3! whitespace-nowrap">
              <Check size={20} strokeWidth={3} aria-hidden />Stimmt<Kbd>R</Kbd>
            </Button>
          </div>
          <p className="text-center text-sm text-muted lg:text-left">Die Musik läuft weiter. Deine Stimme kannst du ändern.</p>
        </>
      )}
      {game.hostPlayerId === myId && <HostDecides act={act} />}
    </>
  );
}

/** The vote has no time limit: if it gets stuck (phones in pockets), the host settles it. */
function HostDecides({ act }: { act: GameControls["act"] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-1 text-sm whitespace-nowrap text-muted lg:justify-start">
      <span className="px-1">Als Host:</span>
      <Button variant="ghost" size="sm" className="px-2.5!" onClick={() => act({ type: "decide", confirm: true })}>Punkt geben</Button>
      <Button variant="ghost" size="sm" className="px-2.5!" onClick={() => act({ type: "decide", confirm: false })}>Kein Punkt</Button>
    </div>
  );
}

function Reveal({ game, round, controls, myId }: ViewProps) {
  const winner = findPlayer(game, round.result?.winner);
  const headline = resultHeadline(round, winner?.name, myId);
  return (
    <>
      <div role="status" className={`bubble-in flex h-15 items-center gap-3 rounded-full px-3 lg:self-start lg:pr-5 ${winner ? "bg-primary text-on-accent" : "bg-surface"}`}>
        {winner && <Avatar name={winner.name} color={playerColor(game, winner.id)} size={44} />}
        <span className="flex-1 px-2 font-display text-xl font-extrabold lg:text-3xl">{headline}</span>
        {winner && <span className="inline-flex h-11 min-w-11 items-center justify-center rounded-full bg-bg px-3 font-display text-xl font-extrabold text-primary-text">+1</span>}
      </div>
      {round.song && <SongBox song={round.song} />}
      <Card className="p-3 lg:hidden">
        <Standings game={game} highlight={winner ? [winner.id] : []} animate note={id => (id === myId ? "du" : undefined)} />
      </Card>
      <div className="flex-1" />
      <NextBar game={game} controls={controls} myId={myId} />
    </>
  );
}
