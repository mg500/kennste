"use client";

import { Check, Pause, Play, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Avatar, Card, ProgressBar, TimerRing } from "@/components/ui/primitives";
import { HINT_FIELDS, type BuzzerData, type BuzzerRound, buzzerData } from "@/lib/game/modes/buzzer";
import type { Game, Player } from "@/lib/game/types";
import { usePlaybackProgress, type GameControls } from "@/lib/game/useGameSession";
import { findPlayer, genitive, playerColor, Screen, Standings, TopBar } from "../../shared";
import type { ModeRoundProps } from "../types";
import { Cover, HintFields, useCountdown } from "./parts";
import { HINT_LABELS } from "./Settings";
import { SongPicker } from "./SongPicker";

interface ViewProps {
  game: Game;
  data: BuzzerData;
  round: BuzzerRound;
  controls: GameControls;
  myId: string;
  active: Player;
  progress?: { current: number; duration: number; isPlaying: boolean };
}

/** A running buzzer round, for every role: the active player ("legt auf"), guessers and viewers. */
export function RoundView({ game, controls, myId, playback, onMenu }: ModeRoundProps) {
  const data = buzzerData(game);
  const round = data.round;
  const active = game.players[game.currentPlayerIndex];
  const progress = usePlaybackProgress(playback, round?.track?.id);
  if (!round || !active) return null;

  const props: ViewProps = { game, data, round, controls, myId, active, progress };
  const isActive = active.id === myId;
  return (
    <Screen decor={round.state === "revealed" ? "confetti" : undefined}>
      <TopBar game={game} onMenu={onMenu} />
      {round.state === "picking" ? <Picking {...props} />
        : round.state === "revealed" ? <Reveal {...props} />
        : isActive ? <ActiveTurn {...props} />
        : <Guessing {...props} />}
    </Screen>
  );
}

// ── Picking ──────────────────────────────────────────────────────────────────

function Picking({ game, controls, myId, active }: ViewProps) {
  const isActive = active.id === myId;
  const isViewer = !game.players.some(p => p.id === myId);
  if (isActive) {
    return (
      <>
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-4xl font-extrabold">Du legst auf</h1>
          <p className="text-muted">Such einen Song – die anderen raten gleich.</p>
        </div>
        <SongPicker api={controls.api} gameId={game.id} playerId={myId} onPlay={track => controls.act({ type: "pickSong", track })} />
      </>
    );
  }
  return (
    <>
      <div className="flex items-center gap-3">
        <Avatar name={active.name} color={playerColor(game, active.id)} />
        <h1 className="animate-pulse font-display text-2xl font-extrabold">{active.name} sucht einen Song …</h1>
      </div>
      {isViewer
        ? <p className="text-muted">Du schaust zu.</p>
        : (
          <>
            <p className="text-muted">Merk dir schon Songs für deine Runde vor.</p>
            <SongPicker api={controls.api} gameId={game.id} playerId={myId} />
          </>
        )}
    </>
  );
}

// ── Active player: song is playing, gives hints, judges ─────────────────────

function ActiveTurn({ game, data, round, controls: { act }, active, progress }: ViewProps) {
  const track = round.track;
  const buzzer = findPlayer(game, round.buzzedBy);
  const playLeft = useCountdown(data.settings.playTimeLimit, round.playingAt, round.state === "playing");
  const buzzLeft = useCountdown(data.settings.buzzTimeLimit, round.buzzedAt, round.state === "buzzed");
  const guessers = game.players.filter(p => p.id !== active.id);
  const open = guessers.filter(p => !round.skippedPlayers.includes(p.id) && !round.wrongPlayers.includes(p.id));
  const canReveal = open.length === 0 || playLeft === null || playLeft.seconds === 0;
  const isPlaying = progress?.isPlaying ?? false;
  const playlistTrack = game.settings.songSource === "playlist" ? track?.id : undefined;

  return (
    <>
      {track && (
        <div className="flex items-center gap-4">
          <Cover track={track} size={112} />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="font-display text-2xl leading-tight font-extrabold">{track.name}</span>
            <span className="text-muted">{track.artist}{track.releaseYear && ` · ${track.releaseYear}`}</span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3.5">
        <button onClick={() => act(isPlaying ? { type: "pause" } : { type: "play", trackId: playlistTrack })}
          aria-label={isPlaying ? "Pause" : "Abspielen"}
          className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-text text-bg transition hover:scale-105">
          {isPlaying ? <Pause size={22} fill="currentColor" aria-hidden /> : <Play size={22} fill="currentColor" aria-hidden />}
        </button>
        <div className="flex-1">
          {progress
            ? <ProgressBar {...progress} onSeek={positionMs => act({ type: "seek", positionMs })} />
            : <p className="text-sm text-muted">Starte die Wiedergabe in Spotify, falls nichts läuft.</p>}
        </div>
      </div>

      {round.state === "playing" && (
        <div className="flex flex-col gap-2">
          <span className="font-bold">Tipp geben</span>
          <div className="flex flex-wrap gap-2">
            {HINT_FIELDS.filter(f => data.settings.hintsEnabled[f] && (f !== "year" || track?.releaseYear)).map(f => {
              const revealed = round.revealed[f];
              return (
                <button key={f} disabled={revealed} onClick={() => act({ type: "hint", field: f })}
                  className={`inline-flex h-10 items-center gap-1.5 rounded-full border-2 px-4 text-sm font-bold transition ${revealed ? "border-surface-2 bg-surface-2 text-muted" : "border-primary text-primary hover:bg-primary hover:text-on-accent"}`}>
                  {revealed && <Check size={14} aria-hidden />}{HINT_LABELS[f]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex-1" />

      {round.state === "buzzed" && buzzer ? (
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-center gap-3.5">
            <Avatar name={buzzer.name} color={playerColor(game, buzzer.id)} size={52} />
            <div className="flex flex-col">
              <span className="font-display text-2xl font-extrabold">{buzzer.name} hat gebuzzert!</span>
              <span className="text-muted">
                {data.settings.autoPauseOnBuzz ? "Musik pausiert" : "Musik läuft weiter"}
                {buzzLeft && ` · noch ${buzzLeft.seconds} s`}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Button variant="buzz" size="lg" onClick={() => act({ type: "judge", verdict: "wrong" })}><X size={20} strokeWidth={3} aria-hidden />Falsch</Button>
            <Button variant="positive" size="lg" onClick={() => act({ type: "judge", verdict: "correct" })}><Check size={20} strokeWidth={3} aria-hidden />Richtig</Button>
          </div>
        </Card>
      ) : (
        <Card className="flex flex-col items-center gap-3 p-5 text-center">
          <span className="font-display text-xl font-extrabold">Warte auf einen Buzz …</span>
          <span className="text-muted">
            {open.length === 0 ? "Alle haben geraten oder übersprungen." : `${open.length} von ${guessers.length} können noch raten`}
          </span>
          <Button variant="secondary" block disabled={!canReveal} onClick={() => act({ type: "reveal" })}>
            {canReveal ? "Auflösen" : `Auflösen in ${playLeft?.seconds} s`}
          </Button>
        </Card>
      )}
    </>
  );
}

// ── Guessers and viewers ────────────────────────────────────────────────────

function Guessing({ game, data, round, controls: { act }, myId, active, progress }: ViewProps) {
  const isViewer = !game.players.some(p => p.id === myId);
  const buzzer = findPlayer(game, round.buzzedBy);
  const playLeft = useCountdown(data.settings.playTimeLimit, round.playingAt, round.state === "playing");
  const buzzLeft = useCountdown(data.settings.buzzTimeLimit, round.buzzedAt, round.state === "buzzed");
  const alreadyBuzzed = (round.buzzCounts[myId] ?? 0) >= data.settings.maxBuzzesPerRound;
  const skipped = round.skippedPlayers.includes(myId);
  const wasWrong = data.lastResult?.type === "wrong" ? data.lastResult.byPlayerName : undefined;

  return (
    <>
      <div className="flex items-center gap-2.5">
        <Avatar name={active.name} color={playerColor(game, active.id)} size={32} />
        <h1 className="font-display text-2xl font-extrabold">Erkennst du {genitive(active.name)} Song?</h1>
      </div>

      {round.track && (
        <div className="flex items-center gap-4">
          <Cover track={round.track} hidden={!round.revealed.cover} size={132} />
          <HintFields track={round.track} revealed={round.revealed} />
        </div>
      )}
      {progress && <ProgressBar {...progress} />}
      {wasWrong && round.state === "playing" && <p className="font-bold text-buzz">{wasWrong} lag falsch – weiter geht&apos;s!</p>}

      <div className="flex-1" />

      {round.state === "buzzed" ? (
        <Card className="flex flex-col items-center gap-3.5 p-6 text-center">
          {round.buzzedBy === myId ? (
            <>
              <span className="font-display text-3xl font-extrabold">Du bist dran!</span>
              <span className="text-muted">Sag Titel und Interpret laut – {active.name} entscheidet.</span>
            </>
          ) : (
            <>
              <span className="font-display text-2xl font-extrabold">{buzzer?.name ?? "Jemand"} hat gebuzzert!</span>
              <span className="text-muted">{active.name} entscheidet …</span>
            </>
          )}
          {buzzLeft && (
            <TimerRing size={120} stroke={10} progress={buzzLeft.progress} color="var(--primary)" track="var(--surface-2)">
              <span className="font-display text-5xl font-extrabold tabular-nums">{buzzLeft.seconds}</span>
            </TimerRing>
          )}
        </Card>
      ) : isViewer ? (
        <Card className="text-center text-muted">Du schaust zu.</Card>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <TimerRing size={236} stroke={10} progress={playLeft?.progress ?? 1}>
            <button onClick={() => act({ type: "buzz" })} disabled={alreadyBuzzed}
              style={{ "--shade": "var(--buzz-shade)" } as React.CSSProperties}
              className="pressable absolute inset-[18px] rounded-full bg-buzz font-display text-5xl font-extrabold tracking-wide text-on-accent disabled:opacity-40">
              BUZZ
            </button>
          </TimerRing>
          <span className="text-sm text-muted">
            {alreadyBuzzed ? "Du hast schon gebuzzert."
              : playLeft && playLeft.seconds > 0 ? `Auflösen möglich in ${playLeft.seconds} s`
              : " "}
          </span>
          <Button variant="outline" disabled={skipped} onClick={() => act({ type: "skip" })}>
            {skipped ? <><Check size={16} aria-hidden />Übersprungen</> : "Keine Ahnung – überspringen"}
          </Button>
        </div>
      )}
    </>
  );
}

// ── Result of the round ──────────────────────────────────────────────────────

function nextPlayer(game: Game): Player | null {
  const nextIndex = (game.currentPlayerIndex + 1) % game.players.length;
  const nextRound = nextIndex === 0 ? game.currentRound + 1 : game.currentRound;
  const { goal, maxRounds, targetScore } = game.settings;
  if (goal === "rounds" && nextRound > maxRounds) return null;
  if (goal === "score" && Object.values(game.scores).some(s => s >= targetScore)) return null;
  return game.players[nextIndex];
}

function Reveal({ game, data, round, controls: { act }, myId, active }: ViewProps) {
  const result = data.lastResult;
  const track = round.track;
  const scorer = result?.type === "correct" ? game.players.find(p => p.id === result.byPlayerId) : undefined;
  const next = nextPlayer(game);
  const canContinue = active.id === myId || game.hostPlayerId === myId;
  const headline = scorer ? (scorer.id === myId ? "Du hast's erraten!" : `${scorer.name} hat's erraten!`) : "Aufgelöst!";

  return (
    <>
      <div className="flex flex-col items-center gap-3.5">
        <div className="relative">
          <Cover track={track} size={200} />
          {scorer && (
            <span className="pop-in absolute -top-3.5 -right-3.5 inline-flex h-12 min-w-12 items-center justify-center rounded-full bg-primary px-3 font-display text-2xl font-extrabold text-on-accent">+1</span>
          )}
        </div>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="font-display text-3xl leading-tight font-extrabold">{headline}</h1>
          {track && <span className="text-lg">{track.name}</span>}
          {track && <span className="text-muted">{track.artist}{track.releaseYear && ` · ${track.releaseYear}`}</span>}
        </div>
      </div>

      <Card className="p-3"><Standings game={game} highlight={scorer ? [scorer.id] : []} animate /></Card>

      <div className="flex-1" />
      <p className="text-center text-muted">
        {next ? <>Als Nächstes legt <strong className="text-text">{next.id === myId ? "du" : next.name}</strong> auf</> : "Gleich gibt's die Endwertung"}
      </p>
      {canContinue
        ? <Button size="lg" block onClick={() => act({ type: "next" })}>{next ? "Weiter" : "Zur Endwertung"}</Button>
        : <p className="animate-pulse text-center text-muted">Warte auf {active.name} …</p>}
    </>
  );
}
