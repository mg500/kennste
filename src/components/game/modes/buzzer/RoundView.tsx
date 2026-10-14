"use client";

import { Check, Pause, Play, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Kbd, useHotkeys } from "@/components/ui/hotkeys";
import { Avatar, Card, ProgressBar, TimerRing } from "@/components/ui/primitives";
import { HINT_FIELDS, type BuzzerData, type BuzzerRound, buzzerData } from "@/lib/game/modes/buzzer";
import type { Game, Player } from "@/lib/game/types";
import { usePlaybackProgress, type GameControls } from "@/lib/game/useGameSession";
import { continuingPlayer, nextTurnPlayer } from "@/lib/game/reducer";
import { findPlayer, genitive, playerColor, ScoreAside, Screen, Standings, TopBar } from "../../shared";
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

/** Per-player status for the desktop standings. */
function roundNote(round: BuzzerRound, active: Player) {
  return (id: string) =>
    id === active.id ? "legt auf"
    : round.wrongPlayers.includes(id) ? "falsch"
    : round.skippedPlayers.includes(id) ? "übersprungen"
    : undefined;
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
  const revealed = round.state === "revealed";
  return (
    <Screen desktop decor={revealed ? "confetti" : undefined}
      header={<TopBar game={game} onMenu={onMenu} />}
      aside={revealed ? undefined : <ScoreAside game={game} myId={myId} note={roundNote(round, active)} />}>
      {round.state === "picking" ? <Picking {...props} />
        : revealed ? <Reveal {...props} />
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
          <h1 className="font-display text-4xl font-extrabold lg:text-5xl">Du legst auf</h1>
          <p className="text-muted lg:text-lg">Such einen Song – die anderen raten gleich.</p>
        </div>
        <SongPicker api={controls.api} gameId={game.id} playerId={myId} onPlay={track => controls.act({ type: "pickSong", track })} />
      </>
    );
  }
  return (
    <>
      <div className="flex items-center gap-3">
        <Avatar name={active.name} color={playerColor(game, active.id)} />
        <h1 className="animate-pulse font-display text-2xl font-extrabold lg:text-4xl">{active.name} sucht einen Song …</h1>
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
  const hints = HINT_FIELDS.filter(f => data.settings.hintsEnabled[f] && (f !== "year" || track?.releaseYear));
  const buzzed = round.state === "buzzed" && !!buzzer;

  const togglePlay = () => act(isPlaying ? { type: "pause" } : { type: "play", trackId: playlistTrack });
  const hint = (i: number) => () => { const f = hints[i]; if (f && !round.revealed[f]) act({ type: "hint", field: f }); };
  useHotkeys({
    p: togglePlay,
    1: round.state === "playing" && hint(0), 2: round.state === "playing" && hint(1),
    3: round.state === "playing" && hint(2), 4: round.state === "playing" && hint(3),
    f: buzzed && (() => act({ type: "judge", verdict: "wrong" })),
    r: buzzed && (() => act({ type: "judge", verdict: "correct" })),
    a: !buzzed && canReveal && (() => act({ type: "reveal" })),
  });

  return (
    <>
      {track && (
        <div className="flex items-center gap-4 lg:gap-7">
          <span className="lg:hidden"><Cover track={track} size={112} /></span>
          <span className="hidden lg:block"><Cover track={track} size={200} /></span>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="font-display text-2xl leading-tight font-extrabold lg:text-5xl">{track.name}</span>
            <span className="text-muted lg:text-xl">{track.artist}{track.releaseYear && ` · ${track.releaseYear}`}</span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3.5">
        <button onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Abspielen"}
          className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-text text-bg transition hover:scale-105">
          {isPlaying ? <Pause size={22} fill="currentColor" aria-hidden /> : <Play size={22} fill="currentColor" aria-hidden />}
        </button>
        <div className="flex-1">
          {progress
            ? <ProgressBar {...progress} onSeek={positionMs => act({ type: "seek", positionMs })} />
            : <p className="text-sm text-muted">Starte die Wiedergabe in Spotify, falls nichts läuft.</p>}
        </div>
        <Kbd>P</Kbd>
      </div>
      {round.snippetEnded && round.state !== "revealed" && <p className="text-sm text-muted">Ausschnitt vorbei – mit Play läuft der Song weiter.</p>}

      {round.state === "playing" && (
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
          <span className="font-bold lg:text-lg">Tipp geben</span>
          <div className="flex flex-wrap gap-2">
            {hints.map((f, i) => {
              const revealed = round.revealed[f];
              return (
                <button key={f} disabled={revealed} onClick={() => act({ type: "hint", field: f })}
                  className={`inline-flex h-10 items-center gap-1.5 rounded-full border-2 px-4 text-sm font-bold transition lg:h-11 ${revealed ? "border-surface-2 bg-surface-2 text-muted" : "border-primary text-primary hover:bg-primary hover:text-on-accent"}`}>
                  {revealed && <Check size={14} aria-hidden />}{HINT_LABELS[f]}<Kbd className="ml-1">{i + 1}</Kbd>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex-1" />

      {buzzed ? (
        <Card className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:gap-7 lg:p-7">
          <div className="flex flex-1 items-center gap-3.5">
            <Avatar name={buzzer!.name} color={playerColor(game, buzzer!.id)} size={52} />
            <div className="flex flex-col">
              <span className="font-display text-2xl font-extrabold lg:text-4xl">{buzzer!.name} hat gebuzzert!</span>
              <span className="text-muted lg:text-lg">
                {data.settings.autoPauseOnBuzz ? "Musik pausiert" : "Musik läuft weiter"}
                {buzzLeft && ` · noch ${buzzLeft.seconds} s`}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5 lg:flex lg:gap-3">
            <Button variant="buzz" size="lg" onClick={() => act({ type: "judge", verdict: "wrong" })}>
              <X size={20} strokeWidth={3} aria-hidden />Falsch<Kbd>F</Kbd>
            </Button>
            <Button variant="positive" size="lg" onClick={() => act({ type: "judge", verdict: "correct" })}>
              <Check size={20} strokeWidth={3} aria-hidden />Richtig<Kbd>R</Kbd>
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="flex flex-col items-center gap-3 p-5 text-center lg:flex-row lg:gap-5 lg:p-7 lg:text-left">
          <div className="flex flex-col gap-1 lg:flex-1">
            <span className="font-display text-xl font-extrabold lg:text-3xl">Warte auf einen Buzz …</span>
            <span className="text-muted">
              {!round.playingAt ? "Der Song startet gleich – drück Play, falls nichts läuft."
                : open.length === 0 ? "Alle haben geraten oder übersprungen."
                : `${open.length} von ${guessers.length} können noch raten`}
            </span>
          </div>
          <Button variant="secondary" block disabled={!canReveal} onClick={() => act({ type: "reveal" })} className="lg:w-auto">
            {canReveal ? "Auflösen" : `Auflösen in ${playLeft?.seconds} s`}{canReveal && <Kbd>A</Kbd>}
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
  const canAct = !isViewer && round.state === "playing";

  useHotkeys({
    Space: canAct && !alreadyBuzzed && (() => act({ type: "buzz" })),
    s: canAct && !skipped && (() => act({ type: "skip" })),
  });

  return (
    <>
      <div className="flex items-center gap-2.5">
        <Avatar name={active.name} color={playerColor(game, active.id)} size={32} />
        <h1 className="font-display text-2xl font-extrabold lg:text-5xl">Erkennst du {genitive(active.name)} Song?</h1>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-12">
        {round.track && (
          <div className="flex items-center gap-4 lg:gap-6">
            <span className="lg:hidden"><Cover track={round.track} hidden={!round.revealed.cover} size={132} /></span>
            <span className="hidden lg:block"><Cover track={round.track} hidden={!round.revealed.cover} size={220} /></span>
            <HintFields track={round.track} revealed={round.revealed} />
          </div>
        )}
        <span className="hidden lg:contents"><BuzzArea {...{ round, myId, active, buzzer, buzzLeft, playLeft, alreadyBuzzed, skipped, isViewer, act, desktop: true }} /></span>
      </div>
      {progress && <ProgressBar {...progress} />}
      {round.snippetEnded && round.state === "playing" && <p className="text-sm font-bold text-muted">Ausschnitt vorbei – wer erkennt ihn noch?</p>}
      {wasWrong && round.state === "playing" && <p className="font-bold text-buzz">{wasWrong} lag falsch – weiter geht&apos;s!</p>}

      <div className="flex-1" />
      <span className="contents lg:hidden"><BuzzArea {...{ round, myId, active, buzzer, buzzLeft, playLeft, alreadyBuzzed, skipped, isViewer, act, desktop: false }} /></span>
      {canAct && (
        <div className="hidden lg:block">
          <Button variant="outline" disabled={skipped} onClick={() => act({ type: "skip" })}>
            {skipped ? <><Check size={16} aria-hidden />Übersprungen</> : <>Keine Ahnung – überspringen<Kbd>S</Kbd></>}
          </Button>
        </div>
      )}
    </>
  );
}

/** Buzzer (or the buzzed state) — under the song on phones, next to it on desktop. */
function BuzzArea({ round, myId, active, buzzer, buzzLeft, playLeft, alreadyBuzzed, skipped, isViewer, act, desktop }: {
  round: BuzzerRound; myId: string; active: Player; buzzer?: Player;
  buzzLeft: ReturnType<typeof useCountdown>; playLeft: ReturnType<typeof useCountdown>;
  alreadyBuzzed: boolean; skipped: boolean; isViewer: boolean; act: GameControls["act"]; desktop: boolean;
}) {
  if (round.state === "buzzed") {
    return (
      <Card className={`flex flex-col items-center gap-3.5 p-6 text-center ${desktop ? "flex-1" : ""}`}>
        {round.buzzedBy === myId ? (
          <>
            <span className="font-display text-3xl font-extrabold lg:text-4xl">Du bist dran!</span>
            <span className="text-muted">Sag Titel und Interpret laut – {active.name} entscheidet.</span>
          </>
        ) : (
          <>
            <span className="font-display text-2xl font-extrabold lg:text-4xl">{buzzer?.name ?? "Jemand"} hat gebuzzert!</span>
            <span className="text-muted">{active.name} entscheidet …</span>
          </>
        )}
        {buzzLeft && (
          <TimerRing size={120} stroke={10} progress={buzzLeft.progress} color="var(--primary)" track="var(--surface-2)">
            <span className="font-display text-5xl font-extrabold tabular-nums">{buzzLeft.seconds}</span>
          </TimerRing>
        )}
      </Card>
    );
  }
  if (isViewer) return <Card className="text-center text-muted">Du schaust zu.</Card>;
  const size = desktop ? 280 : 236;
  return (
    <div className={`flex flex-col items-center gap-4 ${desktop ? "flex-1" : ""}`}>
      <TimerRing size={size} stroke={desktop ? 12 : 10} progress={playLeft?.progress ?? 1}>
        <button onClick={() => act({ type: "buzz" })} disabled={alreadyBuzzed}
          style={{ "--shade": "var(--buzz-shade)" } as React.CSSProperties}
          className={`pressable absolute rounded-full bg-buzz font-display font-extrabold tracking-wide text-on-accent disabled:opacity-40 ${desktop ? "inset-[22px] text-6xl" : "inset-[18px] text-5xl"}`}>
          BUZZ
        </button>
      </TimerRing>
      <span className="flex min-h-5 items-center gap-2 text-sm text-muted">
        {alreadyBuzzed ? "Du hast schon gebuzzert."
          : playLeft && playLeft.seconds > 0 ? `Auflösen möglich in ${playLeft.seconds} s`
          : null}
        {desktop && !alreadyBuzzed && (
          <>{playLeft && playLeft.seconds > 0 ? "· oder" : "oder"} <Kbd className="text-text">Leertaste</Kbd></>
        )}
      </span>
      {!desktop && (
        <Button variant="outline" disabled={skipped} onClick={() => act({ type: "skip" })}>
          {skipped ? <><Check size={16} aria-hidden />Übersprungen</> : "Keine Ahnung – überspringen"}
        </Button>
      )}
    </div>
  );
}

// ── Result of the round ──────────────────────────────────────────────────────

function Reveal({ game, data, round, controls: { act }, myId, active }: ViewProps) {
  const result = data.lastResult;
  const track = round.track;
  const scorer = result?.type === "correct" ? game.players.find(p => p.id === result.byPlayerId) : undefined;
  const next = nextTurnPlayer(game);
  const continuing = continuingPlayer(game) ?? active;
  const canContinue = continuing.id === myId;
  const headline = scorer ? (scorer.id === myId ? "Du hast's erraten!" : `${scorer.name} hat's erraten!`) : "Aufgelöst!";
  useHotkeys({ Enter: canContinue && (() => act({ type: "next" })) });

  return (
    <>
      <div className="flex flex-1 flex-col gap-3.5 lg:grid lg:grid-cols-[minmax(0,1fr)_440px] lg:items-center lg:gap-16">
        <div className="flex flex-col items-center gap-3.5 lg:flex-row lg:gap-12">
          <div className="relative">
            <span className="lg:hidden"><Cover track={track} size={200} /></span>
            <span className="hidden lg:block"><Cover track={track} size={340} /></span>
            {scorer && (
              <span className="pop-in absolute -top-3.5 -right-3.5 inline-flex h-12 min-w-12 items-center justify-center rounded-full bg-primary px-3 font-display text-2xl font-extrabold text-on-accent lg:-top-5.5 lg:-right-5.5 lg:h-18 lg:min-w-18 lg:text-[32px]">+1</span>
            )}
          </div>
          <div className="flex min-w-0 flex-col items-center gap-1 text-center lg:items-start lg:gap-3.5 lg:text-left">
            <h1 className="font-display text-3xl leading-tight font-extrabold lg:text-6xl lg:leading-none">{headline}</h1>
            <div className="flex flex-col items-center gap-1 lg:items-start lg:gap-1.5">
              {track && <span className="text-lg lg:text-3xl lg:font-bold">{track.name}</span>}
              {track && <span className="text-muted lg:text-xl">{track.artist}{track.releaseYear && ` · ${track.releaseYear}`}</span>}
            </div>
            <span className="hidden text-muted lg:block">Aufgelegt von {active.id === myId ? "dir" : active.name}</span>
          </div>
        </div>

        <Card className="p-3 lg:p-5">
          <h2 className="mb-2 hidden text-xl font-bold lg:block">Punktestand</h2>
          <Standings game={game} highlight={scorer ? [scorer.id] : []} animate note={id => (id === myId ? "du" : undefined)} />
        </Card>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
        <p className="text-center text-muted lg:flex-1 lg:text-left lg:text-lg">
          {next ? <>Als Nächstes legt <strong className="text-text">{next.id === myId ? "du" : next.name}</strong> auf</> : "Gleich gibt's die Endwertung"}
        </p>
        {canContinue
          ? <Button size="lg" block onClick={() => act({ type: "next" })} className="lg:w-[440px] lg:shrink-0">{next ? "Weiter" : "Zur Endwertung"}<Kbd>Enter</Kbd></Button>
          : <p className="animate-pulse text-center text-muted lg:w-[440px]">Warte auf {continuing.name} …</p>}
      </div>
    </>
  );
}
