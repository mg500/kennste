"use client";

import { useState } from "react";
import { Check, Pause, Play, Shuffle, Timer, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Kbd, useHotkeys } from "@/components/ui/hotkeys";
import { Avatar, ProgressBar, TimerDigits } from "@/components/ui/primitives";
import { useCountdown } from "@/components/ui/useCountdown";
import { correctIndex, timelineData, timelineOf, type TimelineData, type TimelineRound } from "@/lib/game/modes/timeline";
import { continuingPlayer } from "@/lib/game/reducer";
import type { Game, Player } from "@/lib/game/types";
import { usePlaybackProgress, type GameControls } from "@/lib/game/useGameSession";
import { genitive, playerColor, ScoreAside, Screen, TopBar } from "../../shared";
import type { ModeRoundProps } from "../types";
import { CoopTopBar, TeamAside, votesOf } from "./coop";
import { MysteryCard, Timeline } from "./Timeline";
import { ContinueBar } from "../../Continue";

type Countdown = ReturnType<typeof useCountdown>;

interface ViewProps {
  game: Game;
  data: TimelineData;
  round: TimelineRound;
  controls: GameControls;
  myId: string;
  active: Player;
  progress?: { current: number; duration: number; isPlaying: boolean };
  timeLeft: Countdown;
}

export function RoundView({ game, controls, myId, playback, onMenu }: ModeRoundProps) {
  const data = timelineData(game);
  const round = data.round;
  const active = game.players[game.currentPlayerIndex];
  const progress = usePlaybackProgress(playback, round?.trackId);
  const timeLeft = useCountdown(data.settings.placeTimeLimit, round?.playingAt, round?.state === "listening");

  const coop = data.settings.coop;
  const header = coop ? <CoopTopBar game={game} onMenu={onMenu} /> : <TopBar game={game} onMenu={onMenu} />;
  if (!round || !active) {
    return (
      <Screen desktop header={header}>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <h1 className="font-display text-3xl font-extrabold">Keine Songs mehr</h1>
          <p className="text-muted">Die Playlist ist durchgespielt. Der Host kann das Spiel im Menü beenden.</p>
        </div>
      </Screen>
    );
  }

  const props: ViewProps = { game, data, round, controls, myId, active, progress, timeLeft };
  return (
    <Screen desktop decor={round.state === "revealed" && round.result?.correct ? "confetti" : undefined}
      header={header}
      aside={coop
        ? <TeamAside game={game} activeId={active.id} myId={myId} />
        : <ScoreAside game={game} myId={myId} note={id => (id === active.id ? "ist dran" : undefined)} />}>
      {round.state === "revealed" ? <Reveal {...props} />
        : active.id === myId ? <Place key={round.trackId} {...props} />
        : <Watch {...props} />}
    </Screen>
  );
}

function Playback({ progress, act, trackId, controls: showControls }: {
  progress?: ViewProps["progress"]; act: GameControls["act"]; trackId: string; controls: boolean;
}) {
  const isPlaying = progress?.isPlaying ?? false;
  return (
    <div className="flex items-center gap-3">
      {showControls && (
        // The server resumes instead of restarting when this song is already loaded
        <button onClick={() => act(isPlaying ? { type: "pause" } : { type: "play", trackId })}
          aria-label={isPlaying ? "Pause" : "Abspielen"}
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-on-accent text-buzz">
          {isPlaying ? <Pause size={20} fill="currentColor" aria-hidden /> : <Play size={20} fill="currentColor" aria-hidden />}
        </button>
      )}
      <div className="min-w-0 flex-1">
        {progress ? <ProgressBar {...progress} /> : <p className="text-sm">Song startet auf dem Spotify-Gerät des Hosts …</p>}
      </div>
    </div>
  );
}

function TimeLeft({ left }: { left: Countdown }) {
  if (!left) return null;
  return (
    <span role="timer" aria-label={`Noch ${left.seconds} Sekunden`}
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 font-bold tabular-nums ${left.seconds <= 5 ? "bg-on-accent text-buzz" : "bg-on-accent/15"}`}>
      <Timer size={16} aria-hidden /><TimerDigits left={left} /> s
    </span>
  );
}

// ── Active player places the hidden song ─────────────────────────────────────

function Place({ game, data, round, controls: { act }, myId, progress, timeLeft }: ViewProps) {
  const [slot, setSlot] = useState<number | null>(null);
  const cards = timelineOf(data, myId);
  const coop = data.settings.coop;
  const isPlaying = progress?.isPlaying ?? false;
  // Everyone else sees the chosen gap live
  const choose = (index: number) => { setSlot(index); act({ type: "aim", index }); };
  const move = (dir: -1 | 1) =>
    choose(Math.max(0, Math.min(cards.length, slot === null ? (dir > 0 ? 0 : cards.length) : slot + dir)));
  useHotkeys({
    ArrowLeft: () => move(-1),
    ArrowRight: () => move(1),
    Enter: slot !== null && (() => act({ type: "place", index: slot })),
    n: () => act({ type: "redraw" }),
    p: () => act(isPlaying ? { type: "pause" } : { type: "play", trackId: round.trackId }),
  });
  return (
    <>
      {coop && <h1 className="font-display text-2xl font-extrabold lg:text-4xl">Du bist dran – das Team berät</h1>}
      <MysteryCard size={72}>
        <div className="flex items-start justify-between gap-3">
          <span className="font-display text-2xl leading-tight font-extrabold lg:text-5xl">Wann kam dieser Song raus?</span>
          <TimeLeft left={timeLeft} />
        </div>
        <Playback progress={progress} act={act} trackId={round.trackId} controls />
      </MysteryCard>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-muted lg:text-lg lg:font-bold lg:text-text">
          <span className="lg:hidden">{coop ? "Die anderen schlagen Lücken vor – du entscheidest." : "Tippe auf die Lücke, in die der Song gehört."}</span>
          <span className="hidden lg:inline">{coop ? "Euer Zeitstrahl" : "Dein Zeitstrahl"}</span>
        </p>
        <span className="hidden items-center gap-1.5 text-sm text-muted lg:flex">
          <Kbd className="text-text">←</Kbd><Kbd className="text-text">→</Kbd> Lücke wählen
          <Kbd className="ml-2 text-text">Enter</Kbd> einordnen
        </span>
      </div>
      <Timeline cards={cards} selected={slot} onSelect={choose} votes={coop ? votesOf(game, round) : undefined} />
      <div className="flex-1" />
      <div className="sticky bottom-4 flex flex-col gap-2 lg:static lg:flex-row lg:items-center lg:gap-4">
        <Button size="lg" block disabled={slot === null} onClick={() => slot !== null && act({ type: "place", index: slot })} className="lg:w-auto lg:px-9">
          Hier einordnen<Kbd>Enter</Kbd>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => act({ type: "redraw" })} className="self-center">
          <Shuffle size={16} aria-hidden />Anderen Song<Kbd>N</Kbd>
        </Button>
      </div>
    </>
  );
}

// ── Everyone else watches ────────────────────────────────────────────────────

function Watch({ game, data, round, controls: { act }, myId, active, progress, timeLeft }: ViewProps) {
  const isHost = game.hostPlayerId === myId;
  const coop = data.settings.coop;
  const mine = coop ? undefined : data.timelines[myId];
  const aim = round.aim ?? null;
  const marker = aim === null ? null : { index: aim, label: `${active.name} tippt hier`, tone: "aim" as const };
  const canSuggest = coop && game.players.some(p => p.id === myId);
  const suggestion = round.suggestions?.[myId] ?? null;
  const suggest = (index: number) => act({ type: "suggest", index: suggestion === index ? null : index });
  return (
    <>
      <div className="flex items-center gap-3">
        <Avatar name={active.name} color={playerColor(game, active.id)} />
        <h1 className="font-display text-2xl font-extrabold lg:text-4xl">{active.name} ordnet ein …</h1>
      </div>
      {canSuggest && <p className="-mt-2 text-muted">Tipp eine Lücke an, um sie vorzuschlagen. {active.name} entscheidet.</p>}
      <MysteryCard size={56}>
        <div className="flex items-center justify-between gap-3">
          <span className="font-bold">Wann kam dieser Song raus?</span>
          <TimeLeft left={timeLeft} />
        </div>
        <Playback progress={progress} act={act} trackId={round.trackId} controls={isHost} />
      </MysteryCard>
      <section className="flex flex-col gap-2" aria-label={coop ? "Euer Zeitstrahl" : `Zeitstrahl von ${active.name}`}>
        <h2 className="font-bold">{coop ? "Euer Zeitstrahl" : `${genitive(active.name)} Zeitstrahl`}</h2>
        {canSuggest
          ? <Timeline cards={timelineOf(data, active.id)} selected={suggestion} onSelect={suggest} selectedLabel="Dein Vorschlag"
              marker={marker} votes={votesOf(game, { ...round, suggestions: Object.fromEntries(Object.entries(round.suggestions ?? {}).filter(([id]) => id !== myId)) })} />
          : <Timeline cards={timelineOf(data, active.id)} marker={marker} votes={coop ? votesOf(game, round) : undefined} />}
      </section>
      {mine && (
        <details className="rounded-card bg-surface p-3">
          <summary className="cursor-pointer font-bold">Deine Karten ({mine.length})</summary>
          <div className="pt-3"><Timeline cards={mine} /></div>
        </details>
      )}
    </>
  );
}

// ── Result ───────────────────────────────────────────────────────────────────

function Reveal({ game, data, round, controls, myId, active }: ViewProps) {
  const { act } = controls;
  const result = round.result;
  const isMe = active.id === myId;
  const continuing = continuingPlayer(game) ?? active;
  const canContinue = continuing.id === myId;
  useHotkeys({ Enter: canContinue && (() => act({ type: "next" })) });
  if (!result) return null;
  const { card, correct } = result;
  const timeline = timelineOf(data, active.id);
  const coop = data.settings.coop;
  const gameOver = coop && !data.livesLeft;
  // Correct: the card is already in the timeline. Wrong: show where it belonged and where it was put.
  const misplaced = correct ? undefined : { index: correctIndex(timeline, card.year), card, tone: "misplaced" as const };
  const wrongTip = !correct && result.index !== null
    ? { index: result.index, label: isMe ? "Dein Tipp" : `${genitive(active.name)} Tipp`, tone: "wrong" as const }
    : null;
  const lostLife = gameOver ? "keine Leben mehr" : "ein Leben weniger";
  const message = coop
    ? (correct ? "Richtig! Die Karte gehört dem Team." : result.index === null ? `Zeit abgelaufen – ${lostLife}.` : `Daneben – ${lostLife}.`)
    : correct
    ? (isMe ? "Richtig! Die Karte gehört dir." : `Richtig! Die Karte gehört ${active.name}.`)
    : result.index === null
      ? (isMe ? "Zeit abgelaufen – die Karte ist weg." : `Zeit abgelaufen – ${active.name} geht leer aus.`)
      : (isMe ? "Daneben – die Karte ist weg." : `Daneben – ${active.name} geht leer aus.`);

  return (
    <>
      <div className="flex items-center gap-4">
        {card.albumArt
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={card.albumArt} alt="" className="h-28 w-28 shrink-0 rounded-2xl object-cover shadow-2xl lg:h-40 lg:w-40" />
          : <span className="h-28 w-28 shrink-0 rounded-2xl bg-surface lg:h-40 lg:w-40" />}
        <div className="flex min-w-0 flex-col">
          <span className="font-display text-6xl leading-none font-extrabold text-primary tabular-nums lg:text-8xl">{card.year}</span>
          <span className="truncate text-lg font-bold lg:text-2xl">{card.name}</span>
          <span className="truncate text-muted lg:text-lg">{card.artist}</span>
        </div>
      </div>

      <div className={`flex items-center gap-3 rounded-card p-4 font-bold ${correct ? "bg-positive text-on-accent" : "bg-buzz text-on-accent"}`}>
        {correct ? <Check size={24} strokeWidth={3} aria-hidden /> : <X size={24} strokeWidth={3} aria-hidden />}
        <span className="text-lg">{message}</span>
      </div>

      <Timeline cards={timeline} extra={misplaced} marker={wrongTip} highlightId={correct ? card.trackId : undefined} />

      <div className="flex-1" />
      <ContinueBar game={game} controls={controls} myId={myId} label={gameOver ? "Zum Ergebnis" : "Weiter"}
        onContinue={() => act({ type: "next" })} className="lg:w-auto lg:self-start lg:px-9" />
    </>
  );
}
