"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Pause, Play, Shuffle, Timer, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Kbd, useHotkeys } from "@/components/ui/hotkeys";
import { Avatar, ProgressBar } from "@/components/ui/primitives";
import { useCountdown } from "@/components/ui/useCountdown";
import { correctIndex, hitsterData, type HitsterData, type HitsterRound } from "@/lib/game/modes/hitster";
import { continuingPlayer } from "@/lib/game/reducer";
import type { Game, Player } from "@/lib/game/types";
import { usePlaybackProgress, type GameControls } from "@/lib/game/useGameSession";
import { genitive, playerColor, ScoreAside, Screen, TopBar } from "../../shared";
import type { ModeRoundProps } from "../types";
import { MysteryCard, Timeline } from "./Timeline";

type Countdown = ReturnType<typeof useCountdown>;

interface ViewProps {
  game: Game;
  data: HitsterData;
  round: HitsterRound;
  controls: GameControls;
  myId: string;
  active: Player;
  progress?: { current: number; duration: number; isPlaying: boolean };
  timeLeft: Countdown;
}

/**
 * Ends the turn when the time limit runs out. The active player's client reports it right away,
 * the host's a moment later as a fallback (e.g. if the active player went offline).
 */
function useTimeout(game: Game, round: HitsterRound | undefined, timeLeft: Countdown, myId: string, act: GameControls["act"]) {
  const sent = useRef<string | null>(null);
  const active = game.players[game.currentPlayerIndex];
  const role = active?.id === myId ? "active" : game.hostPlayerId === myId ? "host" : null;
  const expired = round?.state === "listening" && timeLeft?.seconds === 0;
  const trackId = round?.trackId;
  useEffect(() => {
    if (!expired || !role || !trackId || sent.current === trackId) return;
    const timer = setTimeout(() => {
      sent.current = trackId;
      act({ type: "timeout" });
    }, role === "active" ? 300 : 3000);
    return () => clearTimeout(timer);
  }, [expired, role, trackId, act]);
}

export function RoundView({ game, controls, myId, playback, onMenu }: ModeRoundProps) {
  const data = hitsterData(game);
  const round = data.round;
  const active = game.players[game.currentPlayerIndex];
  const progress = usePlaybackProgress(playback, round?.trackId);
  const timeLeft = useCountdown(data.settings.placeTimeLimit, round?.playingAt, round?.state === "listening");
  useTimeout(game, round, timeLeft, myId, controls.act);

  if (!round || !active) {
    return (
      <Screen desktop header={<TopBar game={game} onMenu={onMenu} />}>
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
      header={<TopBar game={game} onMenu={onMenu} />}
      aside={<ScoreAside game={game} myId={myId} note={id => (id === active.id ? "ist dran" : undefined)} />}>
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
      <Timer size={16} aria-hidden />{left.seconds} s
    </span>
  );
}

// ── Active player places the hidden song ─────────────────────────────────────

function Place({ data, round, controls: { act }, myId, progress, timeLeft }: ViewProps) {
  const [slot, setSlot] = useState<number | null>(null);
  const cards = data.timelines[myId] ?? [];
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
      <MysteryCard size={72}>
        <div className="flex items-start justify-between gap-3">
          <span className="font-display text-2xl leading-tight font-extrabold lg:text-5xl">Wann kam dieser Song raus?</span>
          <TimeLeft left={timeLeft} />
        </div>
        <Playback progress={progress} act={act} trackId={round.trackId} controls />
      </MysteryCard>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-muted lg:text-lg lg:font-bold lg:text-text">
          <span className="lg:hidden">Tippe auf die Lücke, in die der Song gehört.</span>
          <span className="hidden lg:inline">Dein Zeitstrahl</span>
        </p>
        <span className="hidden items-center gap-1.5 text-sm text-muted lg:flex">
          <Kbd className="text-text">←</Kbd><Kbd className="text-text">→</Kbd> Lücke wählen
          <Kbd className="ml-2 text-text">Enter</Kbd> einordnen
        </span>
      </div>
      <Timeline cards={cards} selected={slot} onSelect={choose} />
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
  const mine = data.timelines[myId];
  const aim = round.aim ?? null;
  return (
    <>
      <div className="flex items-center gap-3">
        <Avatar name={active.name} color={playerColor(game, active.id)} />
        <h1 className="font-display text-2xl font-extrabold lg:text-4xl">{active.name} ordnet ein …</h1>
      </div>
      <MysteryCard size={56}>
        <div className="flex items-center justify-between gap-3">
          <span className="font-bold">Wann kam dieser Song raus?</span>
          <TimeLeft left={timeLeft} />
        </div>
        <Playback progress={progress} act={act} trackId={round.trackId} controls={isHost} />
      </MysteryCard>
      <section className="flex flex-col gap-2" aria-label={`Zeitstrahl von ${active.name}`}>
        <h2 className="font-bold">{genitive(active.name)} Zeitstrahl</h2>
        <Timeline cards={data.timelines[active.id] ?? []}
          marker={aim === null ? null : { index: aim, label: `${active.name} tippt hier`, tone: "aim" }} />
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

function Reveal({ game, data, round, controls: { act }, myId, active }: ViewProps) {
  const result = round.result;
  const isMe = active.id === myId;
  const continuing = continuingPlayer(game) ?? active;
  const canContinue = continuing.id === myId;
  useHotkeys({ Enter: canContinue && (() => act({ type: "next" })) });
  if (!result) return null;
  const { card, correct } = result;
  const timeline = data.timelines[active.id] ?? [];
  // Correct: the card is already in the timeline. Wrong: show where it belonged and where it was put.
  const misplaced = correct ? undefined : { index: correctIndex(timeline, card.year), card, tone: "misplaced" as const };
  const wrongTip = !correct && result.index !== null
    ? { index: result.index, label: isMe ? "Dein Tipp" : `${genitive(active.name)} Tipp`, tone: "wrong" as const }
    : null;
  const message = correct
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
      {canContinue
        ? <Button size="lg" block onClick={() => act({ type: "next" })} className="lg:w-auto lg:self-start lg:px-9">Weiter<Kbd>Enter</Kbd></Button>
        : <p className="animate-pulse text-center text-muted">Warte auf {continuing.name} …</p>}
    </>
  );
}
