"use client";

import type { Game, HintField } from "@/lib/game/types";
import type { GameControls } from "@/lib/game/useGameSession";
import {
  Countdown, DEFAULT_ACCENT, Divider, HintButton, Label, PlaybackBar, PlayPauseButton, ResultBanner, SongCard, useCountdown,
} from "./parts";
import { Scoreboard } from "./Scoreboard";
import { SongPicker } from "./SongPicker";

interface Props {
  game: Game;
  controls: GameControls;
  myId: string;
  accentColor?: string;
  playbackMs?: { current: number; duration: number; isPlaying: boolean };
}

const HINTS: { field: HintField; label: string; flag: "hintRevealed" | "hintTitleRevealed" | "hintArtistRevealed" | "hintYearRevealed" }[] = [
  { field: "cover", label: "Cover", flag: "hintRevealed" },
  { field: "title", label: "Titel", flag: "hintTitleRevealed" },
  { field: "artist", label: "Interpret", flag: "hintArtistRevealed" },
  { field: "year", label: "Jahr", flag: "hintYearRevealed" },
];

/** A running round, seen either by the picker (whose song is playing) or by a guesser/viewer. */
export function RoundView({ game, controls: { api, act }, myId, accentColor = DEFAULT_ACCENT, playbackMs }: Props) {
  const { players, settings, lastResult } = game;
  const round = game.round ?? { state: "picking", buzzedPlayers: [], buzzCounts: {}, skippedPlayers: [], wrongPlayers: [] };
  const picker = players[game.currentPlayerIndex];
  const isPicker = picker?.id === myId;
  const isViewer = !players.some(p => p.id === myId);
  const buzzer = players.find(p => p.id === round.buzzedBy);

  const buzzTimeLeft = useCountdown(settings.buzzTimeLimit, round.buzzedAt, round.state === "buzzed");
  const playTimeLeft = useCountdown(settings.playTimeLimit, round.playingAt, round.state === "playing");

  const song = round.songName
    ? { name: round.songName, artist: round.artistName ?? "", releaseYear: round.releaseYear, albumArt: round.albumArt || null }
    : null;
  const guessers = players.filter(p => p.id !== picker?.id);
  const everyoneDone = guessers.length > 0 && guessers.every(p => round.skippedPlayers.includes(p.id) || round.wrongPlayers.includes(p.id));
  const playbackControls = (
    <PlayPauseButton
      isPlaying={playbackMs?.isPlaying ?? false}
      onPlay={() => act({ type: "play", trackId: settings.songSource === "playlist" ? round.trackId : undefined })}
      onPause={() => act({ type: "pause" })}
    />
  );

  const scoreboard = (
    <Scoreboard
      players={players} scores={game.scores} myId={myId} currentPlayerId={picker?.id} animate
      skippedPlayers={round.skippedPlayers} wrongPlayers={round.wrongPlayers} guessedSongs={game.guessedSongs}
      accentColor={accentColor}
      currentRound={settings.gameMode !== "bestOf" ? game.currentRound : undefined}
      maxRounds={settings.gameMode !== "bestOf" ? settings.maxRounds : undefined}
      bestOf={settings.gameMode === "bestOf" ? settings.bestOf : undefined}
    />
  );

  // ── Between songs: picker chooses, everyone else can fill their queue ──
  if (round.state === "picking") {
    return (
      <>
        {lastResult && <ResultBanner result={lastResult} />}
        {lastResult?.song && <SongCard song={lastResult.song} faded />}
        <Divider accentColor={accentColor} />
        <Label pulse>{isPicker ? "Wähle einen Song" : `${picker?.name} wählt einen Song`}</Label>
        {!isViewer && (
          <SongPicker
            api={api} gameId={game.id} playerId={myId} accentColor={accentColor}
            onPlay={isPicker ? track => act({ type: "pickSong", track }) : undefined}
          />
        )}
        {scoreboard}
      </>
    );
  }

  // ── Picker: sees their song, controls playback, gives hints and judges ──
  if (isPicker) {
    return (
      <>
        {lastResult && <ResultBanner result={lastResult} />}
        {song && <SongCard song={song} />}
        {playbackMs && <PlaybackBar {...playbackMs} accentColor={accentColor} onSeek={positionMs => act({ type: "seek", positionMs })} />}
        <Divider accentColor={accentColor} />
        {round.state === "playing" ? (
          <>
            <Label>Dein Song wird gespielt</Label>
            {playbackControls}
            <div className="flex gap-2 flex-wrap justify-center">
              {HINTS.filter(h => settings.hintsEnabled[h.field] && !round[h.flag] && (h.field !== "year" || round.releaseYear)).map(h => (
                <HintButton key={h.field} label={h.label} accentColor={accentColor} onClick={() => act({ type: "hint", field: h.field })} />
              ))}
              {(everyoneDone || playTimeLeft === 0) && (
                <HintButton label="Auflösen" accentColor={accentColor} onClick={() => act({ type: "reveal" })} />
              )}
            </div>
          </>
        ) : (
          <>
            {playbackControls}
            <p className="text-gray-400 text-sm">{buzzer?.name ?? "Jemand"} hat gebuzzert!</p>
            <Countdown seconds={buzzTimeLeft} />
            <div className="flex gap-3 flex-wrap justify-center">
              <button onClick={() => act({ type: "judge", verdict: "correct" })}
                className="text-sm text-green-400 hover:text-green-300 border border-green-900 hover:border-green-700 px-4 py-2 rounded-lg transition">
                Richtig
              </button>
              <button onClick={() => act({ type: "judge", verdict: "wrong" })}
                className="text-sm text-red-400 hover:text-red-300 border border-red-900 hover:border-red-700 px-4 py-2 rounded-lg transition">
                Falsch
              </button>
            </div>
          </>
        )}
        {scoreboard}
      </>
    );
  }

  // ── Guessers and viewers ──
  const alreadyBuzzed = (round.buzzCounts[myId] ?? 0) >= settings.maxBuzzesPerRound;
  const alreadySkipped = round.skippedPlayers.includes(myId);
  return (
    <>
      <Label>Erkennst du {picker?.name}{picker?.name?.endsWith("s") ? "'" : "s"} Song?</Label>
      {lastResult && <ResultBanner result={lastResult} />}
      {round.state === "playing" ? (
        <div className="flex flex-col items-center gap-4 w-full">
          {song && (
            <SongCard song={song} revealed={{
              cover: round.hintRevealed, title: round.hintTitleRevealed,
              artist: round.hintArtistRevealed, year: round.hintYearRevealed,
            }} />
          )}
          {playbackMs && <PlaybackBar {...playbackMs} accentColor={accentColor} />}
          <Divider accentColor={accentColor} />
          {isViewer ? (
            <p className="text-gray-700 text-xs tracking-widest uppercase">Zuschauer</p>
          ) : (
            <>
              {alreadyBuzzed ? (
                <p className="text-gray-700 text-sm">Du hast bereits gebuzzert…</p>
              ) : (
                <button onClick={() => act({ type: "buzz" })}
                  className="w-36 h-36 rounded-full border border-white/20 hover:border-white/60 text-white text-xl font-light transition active:scale-95">
                  Buzz
                </button>
              )}
              {alreadySkipped ? (
                <p className="text-gray-800 text-xs">Du hast übersprungen</p>
              ) : (
                <button onClick={() => act({ type: "skip" })}
                  className="text-xs text-gray-600 hover:text-gray-400 border border-gray-800 hover:border-gray-600 px-4 py-2 rounded-lg transition">
                  Überspringen
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 text-center">
          {round.buzzedBy === myId
            ? <p className="text-white">Du hast gebuzzert!</p>
            : <p className="text-gray-400">{buzzer?.name ?? "Jemand"} hat gebuzzert!</p>}
          <Countdown seconds={buzzTimeLeft} />
          <p className="text-gray-700 text-xs">Warte auf Auflösung…</p>
        </div>
      )}
      {scoreboard}
    </>
  );
}
