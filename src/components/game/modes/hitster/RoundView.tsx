"use client";

import { useState } from "react";
import { Check, Pause, Play, Shuffle, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Avatar, ProgressBar } from "@/components/ui/primitives";
import { correctIndex, hitsterData, type HitsterData, type HitsterRound } from "@/lib/game/modes/hitster";
import type { Game, Player } from "@/lib/game/types";
import { usePlaybackProgress, type GameControls } from "@/lib/game/useGameSession";
import { genitive, playerColor, Screen, TopBar } from "../../shared";
import type { ModeRoundProps } from "../types";
import { MysteryCard, Timeline } from "./Timeline";

interface ViewProps {
  game: Game;
  data: HitsterData;
  round: HitsterRound;
  controls: GameControls;
  myId: string;
  active: Player;
  progress?: { current: number; duration: number; isPlaying: boolean };
}

export function RoundView({ game, controls, myId, playback, onMenu }: ModeRoundProps) {
  const data = hitsterData(game);
  const round = data.round;
  const active = game.players[game.currentPlayerIndex];
  const progress = usePlaybackProgress(playback, round?.trackId);

  if (!round || !active) {
    return (
      <Screen>
        <TopBar game={game} onMenu={onMenu} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <h1 className="font-display text-3xl font-extrabold">Keine Songs mehr</h1>
          <p className="text-muted">Die Playlist ist durchgespielt. Der Host kann das Spiel im Menü beenden.</p>
        </div>
      </Screen>
    );
  }

  const props: ViewProps = { game, data, round, controls, myId, active, progress };
  return (
    <Screen decor={round.state === "revealed" && round.result?.correct ? "confetti" : undefined}>
      <TopBar game={game} onMenu={onMenu} />
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

// ── Active player places the hidden song ─────────────────────────────────────

function Place({ data, round, controls: { act }, myId, progress }: ViewProps) {
  const [slot, setSlot] = useState<number | null>(null);
  const cards = data.timelines[myId] ?? [];
  return (
    <>
      <h1 className="font-display text-3xl leading-tight font-extrabold">Wann kam dieser Song raus?</h1>
      <MysteryCard size={72}>
        <span className="font-bold">Hör genau hin …</span>
        <Playback progress={progress} act={act} trackId={round.trackId} controls />
      </MysteryCard>
      <p className="text-muted">Tippe auf die Lücke, in die der Song gehört.</p>
      <Timeline cards={cards} selected={slot} onSelect={setSlot} />
      <div className="flex-1" />
      <div className="sticky bottom-4 flex flex-col gap-2">
        <Button size="lg" block disabled={slot === null} onClick={() => slot !== null && act({ type: "place", index: slot })}>
          Hier einordnen
        </Button>
        <Button variant="ghost" size="sm" onClick={() => act({ type: "redraw" })} className="self-center">
          <Shuffle size={16} aria-hidden />Anderen Song
        </Button>
      </div>
    </>
  );
}

// ── Everyone else watches ────────────────────────────────────────────────────

function Watch({ game, data, round, controls: { act }, myId, active, progress }: ViewProps) {
  const isHost = game.hostPlayerId === myId;
  const mine = data.timelines[myId];
  return (
    <>
      <div className="flex items-center gap-3">
        <Avatar name={active.name} color={playerColor(game, active.id)} />
        <h1 className="font-display text-2xl font-extrabold">{active.name} ordnet ein …</h1>
      </div>
      <MysteryCard size={56}>
        <span className="font-bold">Wann kam dieser Song raus?</span>
        <Playback progress={progress} act={act} trackId={round.trackId} controls={isHost} />
      </MysteryCard>
      <section className="flex flex-col gap-2" aria-label={`Zeitstrahl von ${active.name}`}>
        <h2 className="font-bold">{genitive(active.name)} Zeitstrahl</h2>
        <Timeline cards={data.timelines[active.id] ?? []} />
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
  if (!result) return null;
  const { card, correct } = result;
  const isMe = active.id === myId;
  const canContinue = isMe || game.hostPlayerId === myId;
  const timeline = data.timelines[active.id] ?? [];
  // Correct: the card is already in the timeline. Wrong: show where it would have belonged.
  const misplaced = correct ? undefined : { index: correctIndex(timeline, card.year), card, tone: "misplaced" as const };

  return (
    <>
      <div className="flex items-center gap-4">
        {card.albumArt
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={card.albumArt} alt="" className="h-28 w-28 shrink-0 rounded-2xl object-cover shadow-2xl" />
          : <span className="h-28 w-28 shrink-0 rounded-2xl bg-surface" />}
        <div className="flex min-w-0 flex-col">
          <span className="font-display text-6xl leading-none font-extrabold text-primary tabular-nums">{card.year}</span>
          <span className="truncate text-lg font-bold">{card.name}</span>
          <span className="truncate text-muted">{card.artist}</span>
        </div>
      </div>

      <div className={`flex items-center gap-3 rounded-card p-4 font-bold ${correct ? "bg-positive text-on-accent" : "bg-buzz text-on-accent"}`}>
        {correct ? <Check size={24} strokeWidth={3} aria-hidden /> : <X size={24} strokeWidth={3} aria-hidden />}
        <span className="text-lg">
          {correct
            ? (isMe ? "Richtig! Die Karte gehört dir." : `Richtig! Die Karte gehört ${active.name}.`)
            : (isMe ? "Daneben – die Karte ist weg." : `Daneben – ${active.name} geht leer aus.`)}
        </span>
      </div>

      <Timeline cards={timeline} extra={misplaced} highlightId={correct ? card.trackId : undefined} />

      <div className="flex-1" />
      {canContinue
        ? <Button size="lg" block onClick={() => act({ type: "next" })}>Weiter</Button>
        : <p className="animate-pulse text-center text-muted">Warte auf {active.name} …</p>}
    </>
  );
}
