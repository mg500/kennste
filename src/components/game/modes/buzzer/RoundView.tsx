"use client";

import { useRef } from "react";
import { Check, Pause, Play, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Kbd, useHotkeys } from "@/components/ui/hotkeys";
import { Avatar, Card, ProgressBar, TimerRing } from "@/components/ui/primitives";
import { AUTO_NEXT_MS, HINT_FIELDS, type BuzzerData, type BuzzerRound, buzzerData, openGuessers } from "@/lib/game/modes/buzzer";
import type { Game, Player } from "@/lib/game/types";
import { usePlaybackProgress, type GameControls } from "@/lib/game/useGameSession";
import { continuingPlayer, nextTurnPlayer } from "@/lib/game/reducer";
import { useFlip, useShownScores } from "../../RoundPoints";
import { findPlayer, genitive, playerColor, ScoreAside, Screen, SpotifyLink, Standings, TopBar } from "../../shared";
import type { ModeRoundProps } from "../types";
import { Cover, HintFields, useCountdown } from "./parts";
import { HINT_LABELS } from "./Settings";
import { SongPicker } from "./SongPicker";
import { NextBar } from "../../Continue";

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
    <Screen desktop decor={revealed ? "confetti" : "corner"}
      header={<TopBar game={game} myId={myId} onMenu={onMenu} />}
      aside={revealed ? undefined
        : round.state === "picking" ? <><LastRound data={data} /><ScoreAside game={game} myId={myId} /></>
        : <ScoreAside game={game} myId={myId} note={roundNote(round, active)} />}>
      {round.state === "picking" ? <Picking {...props} />
        : revealed ? <Reveal {...props} />
        : isActive ? <ActiveTurn {...props} />
        : <Guessing {...props} />}
    </Screen>
  );
}

// ── Picking ──────────────────────────────────────────────────────────────────

/** The song of the round before, as a strip above the search (phones). */
function LastSong({ data }: { data: BuzzerData }) {
  const result = data.lastResult;
  if (!result?.song) return null;
  return (
    <section aria-label="Letzter Song" className="flex items-center gap-3 rounded-2xl bg-surface p-2 lg:hidden">
      <SongCover song={result.song} size={48} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-bold">{result.song.name}</span>
        <span className="truncate text-sm text-muted">{result.song.artist} · {result.type === "correct" ? `${result.byPlayerName} hat's erraten` : "nicht erraten"}</span>
      </span>
      <span className="pr-1.5 text-xs font-bold text-muted">Letzter Song</span>
    </section>
  );
}

/** The song of the round before, next to the search (laptop). */
function LastRound({ data }: { data: BuzzerData }) {
  const result = data.lastResult;
  if (!result?.song) return null;
  return (
    <section aria-label="Letzte Runde" className="mb-5 flex flex-col items-center gap-3 rounded-[28px] bg-surface p-6 text-center">
      <span className="self-start text-sm font-bold tracking-wider text-muted uppercase">Letzter Song</span>
      <SongCover song={result.song} size={200} />
      <span className="font-display text-2xl leading-tight font-extrabold">{result.song.name}</span>
      <span className="text-muted">{result.song.artist}{result.song.releaseYear && ` · ${result.song.releaseYear}`}</span>
      <span className="font-bold">{result.type === "correct" ? `${result.byPlayerName} hat's erraten` : "Nicht erraten"}</span>
    </section>
  );
}

function SongCover({ song, size }: { song: { albumArt: string | null }; size: number }) {
  const style = { width: size, height: size, borderRadius: Math.round(size / 6.5) };
  return song.albumArt
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={song.albumArt} alt="" className="shrink-0 object-cover" style={style} />
    : <span className="shrink-0 bg-surface-2" style={style} />;
}

function Picking({ game, data, controls, myId, active }: ViewProps) {
  const { played } = data;
  const isActive = active.id === myId;
  const isViewer = !game.players.some(p => p.id === myId);
  if (isActive) {
    return (
      <>
        <LastSong data={data} />
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-4xl font-extrabold lg:text-5xl">Du legst auf</h1>
          <p className="text-muted lg:text-lg">Such einen Song – die anderen raten gleich.</p>
        </div>
        <SongPicker api={controls.api} gameId={game.id} playerId={myId} played={played} onPlay={track => controls.act({ type: "pickSong", track })} />
      </>
    );
  }
  return (
    <>
      <LastSong data={data} />
      <div className="flex items-center gap-3">
        <Avatar name={active.name} color={playerColor(game, active.id)} />
        <h1 className="animate-pulse font-display text-2xl font-extrabold lg:text-4xl">{active.name} sucht einen Song …</h1>
      </div>
      {isViewer
        ? <p className="text-muted">Du schaust zu.</p>
        : (
          <>
            <p className="text-muted">Merk dir schon Songs für deine Runde vor.</p>
            <SongPicker api={controls.api} gameId={game.id} playerId={myId} played={played} />
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
  const open = openGuessers(game, data);
  const canReveal = open.length === 0 || playLeft === null || playLeft.seconds === 0;
  const isPlaying = progress?.isPlaying ?? false;
  const hints = HINT_FIELDS.filter(f => data.settings.hintsEnabled[f] && (f !== "year" || track?.releaseYear));
  const buzzed = round.state === "buzzed" && !!buzzer;

  const togglePlay = () => act(isPlaying ? { type: "pause" } : { type: "play" });
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
            : <p className="text-sm text-muted">Läuft nichts? In Spotify auf Play drücken.</p>}
        </div>
        <Kbd>P</Kbd>
      </div>

      {round.state === "playing" && (
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
          <span className="font-bold lg:text-lg">Tipp geben</span>
          <div className="flex flex-wrap gap-2">
            {hints.map((f, i) => {
              const revealed = round.revealed[f];
              return (
                <button key={f} disabled={revealed} onClick={() => act({ type: "hint", field: f })}
                  className={`inline-flex h-10 items-center gap-1.5 rounded-full border-2 px-4 text-sm font-bold transition lg:h-11 ${revealed ? "border-surface-2 bg-surface-2 text-muted" : "border-primary text-primary-text hover:bg-primary hover:text-on-accent"}`}>
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
              {!round.playingAt ? "Läuft nichts? In Spotify auf Play drücken."
                : open.length === 0 ? "Alle haben geraten oder übersprungen."
                : `${open.length} von ${guessers.length} können noch raten`}
            </span>
          </div>
          <Button variant="secondary" block disabled={!canReveal} onClick={() => act({ type: "reveal" })} className="lg:w-auto">
            {canReveal ? "Auflösen" : `Auflösung in ${playLeft?.seconds} s`}{canReveal && <Kbd>A</Kbd>}
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
  const alreadyBuzzed = !!round.buzzCounts[myId];
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
      {wasWrong && round.state === "playing" && <p className="font-bold text-buzz-text">{wasWrong} lag falsch – weiter geht&apos;s!</p>}

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
          : playLeft && playLeft.seconds > 0 ? `Auflösung in ${playLeft.seconds} s`
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

function Reveal({ game, data, round, controls, myId, active }: ViewProps) {
  const { act } = controls;
  const result = data.lastResult;
  const track = round.track;
  const scorer = result?.type === "correct" ? game.players.find(p => p.id === result.byPlayerId) : undefined;
  const next = nextTurnPlayer(game);
  // Players pick songs: no button, the next one may start searching right away (otherwise NextBar has Enter)
  const continuing = continuingPlayer(game) ?? active;
  useHotkeys({ Enter: !!round.revealedAt && continuing.id === myId && (() => act({ type: "next" })) });

  return (
    <>
      <ResultBanner game={game} scorer={scorer} myId={myId} />
      <div className="flex flex-1 flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_440px] lg:items-center lg:gap-16">
        <div className="flex flex-col items-center gap-3 text-center lg:flex-row lg:gap-12 lg:text-left">
          <span className="lg:hidden"><Cover track={track} size={220} /></span>
          <span className="hidden lg:block"><Cover track={track} size={340} /></span>
          <div className="flex min-w-0 flex-col items-center gap-1 lg:items-start lg:gap-2">
            {track && <span className="font-display text-3xl leading-tight font-extrabold lg:text-6xl lg:leading-none">{track.name}</span>}
            {track && <span className="text-lg text-muted lg:text-2xl">{track.artist}{track.releaseYear && ` · ${track.releaseYear}`}</span>}
            {track && <SpotifyLink game={game} song={track} />}
            <span className="hidden text-muted lg:block">Aufgelegt von {active.id === myId ? "dir" : active.name}</span>
          </div>
        </div>
        <ScoreChips game={game} highlight={scorer?.id} />
        <Card className="hidden p-5 lg:block">
          <h2 className="mb-2 text-xl font-bold">Punktestand</h2>
          <Standings game={game} highlight={scorer ? [scorer.id] : []} animate note={id => (id === myId ? "du" : undefined)} />
        </Card>
      </div>

      {round.revealedAt
        ? <AutoNext game={game} round={round} myId={myId} onNow={() => act({ type: "next" })} />
        : (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
            <p className="text-center text-muted lg:flex-1 lg:text-left lg:text-lg">
              {next ? <>Als Nächstes legt <strong className="text-text">{next.id === myId ? "du" : next.name}</strong> auf</> : "Gleich gibt's die Endwertung"}
            </p>
            <NextBar game={game} controls={controls} myId={myId} label={next ? "Weiter" : "Zum Endstand"} className="lg:w-[440px] lg:shrink-0" />
          </div>
        )}
    </>
  );
}

/** Compact standings for phones, so the next step stays in view. */
function ScoreChips({ game, highlight }: { game: Game; highlight?: string }) {
  const { scores, gains, order } = useShownScores(game);
  const list = useRef<HTMLOListElement>(null);
  useFlip(list, order.join());
  return (
    <ol ref={list} aria-label="Punktestand" className="flex flex-wrap justify-center gap-2 lg:hidden">
      {order.map(id => findPlayer(game, id)).map(p => p && (
        <li key={p.id} data-flip={p.id} className={`inline-flex h-9 items-center gap-2 rounded-full pr-3 pl-1 text-sm font-bold tabular-nums transition-shadow ${p.id === highlight ? "bg-surface-2" : "bg-surface"} ${gains[p.id] ? "ring-2 ring-positive ring-inset" : ""}`}>
          <Avatar name={p.name} color={playerColor(game, p.id)} size={28} />{p.name} {scores[p.id] ?? 0}
          {p.id === highlight && <span className="text-positive-text">+1</span>}
        </li>
      ))}
    </ol>
  );
}

/** Who guessed it, highlighted at the top (slides in). */
function ResultBanner({ game, scorer, myId }: { game: Game; scorer?: Player; myId: string }) {
  if (!scorer) {
    return <div role="status" className="bubble-in flex h-15 items-center justify-center rounded-full bg-surface px-5 font-display text-xl font-extrabold lg:text-2xl">Aufgelöst – niemand hat&apos;s erraten</div>;
  }
  return (
    <div role="status" style={{ "--shade": "var(--primary-shade)" } as React.CSSProperties}
      className="bubble-in pressable flex h-15 items-center gap-3 rounded-full bg-primary pr-2 pl-2 text-on-accent lg:h-18 lg:self-start lg:pr-3">
      <Avatar name={scorer.name} color={playerColor(game, scorer.id)} size={44} />
      <span className="flex-1 font-display text-xl font-extrabold lg:pr-4 lg:text-3xl">{scorer.id === myId ? "Du hast's erraten!" : `${scorer.name} hat's erraten!`}</span>
      <span className="inline-flex h-11 min-w-11 items-center justify-center rounded-full bg-bg px-3 font-display text-xl font-extrabold text-primary-text lg:h-13 lg:text-2xl">+1</span>
    </div>
  );
}

/** Players pick their songs: the next one starts searching on their own in a few seconds (or right away). */
function AutoNext({ game, round, myId, onNow }: { game: Game; round: BuzzerRound; myId: string; onNow: () => void }) {
  const left = useCountdown(AUTO_NEXT_MS / 1000, round.revealedAt, true);
  const next = nextTurnPlayer(game);
  const seconds = left?.seconds ?? 0;
  if (next?.id === myId) {
    return (
      <Card className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:gap-6 lg:p-6">
        <div className="flex flex-1 items-center gap-3.5">
          <TimerRing size={52} stroke={5} progress={left?.progress ?? 0} color="var(--primary)" track="var(--surface-2)">
            <span className="font-display text-xl font-extrabold tabular-nums">{seconds}</span>
          </TimerRing>
          <div className="flex flex-col">
            <span className="font-display text-xl font-extrabold">Du legst als Nächstes auf</span>
            <span className="text-sm text-muted">Gleich öffnet sich deine Songsuche</span>
          </div>
        </div>
        <Button size="lg" onClick={onNow} className="lg:w-[320px]">Jetzt Song suchen<Kbd>Enter</Kbd></Button>
      </Card>
    );
  }
  return (
    <Card className="flex items-center gap-3 p-4">
      {next && <Avatar name={next.name} color={playerColor(game, next.id)} size={40} />}
      <div className="flex flex-1 flex-col">
        <span className="font-bold">{next ? `${next.name} legt als Nächstes auf` : "Gleich gibt's die Endwertung"}</span>
        {next && <span className="text-sm text-muted">Du kannst gleich Songs vormerken</span>}
      </div>
      <span className="font-display text-xl font-extrabold text-muted tabular-nums">{seconds}</span>
    </Card>
  );
}
