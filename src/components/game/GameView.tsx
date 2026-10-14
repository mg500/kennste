"use client";

import { useEffect, useState } from "react";
import { GameLobby } from "./GameLobby";
import { getModeUI } from "./modes";
import { DEFAULT_ACCENT } from "./parts";
import { Scoreboard } from "./Scoreboard";
import { extractAccentColor } from "@/lib/accentColor";
import { getMode } from "@/lib/game/modes";
import type { Game } from "@/lib/game/types";
import { usePlaybackProgress, type GameControls, type ReceivedPlayback } from "@/lib/game/useGameSession";

interface Props {
  game: Game;
  controls: GameControls;
  myId: string;
  playback: ReceivedPlayback | null;
  notice: string | null;
  /** Called after the host ended the game. */
  onEnded?: () => void;
}

/** Plays the 30s preview (if Spotify still provides one) for everyone but the active player. */
function usePreviewAudio(game: Game, myId: string) {
  const isMyTurn = game.players[game.currentPlayerIndex]?.id === myId;
  const previewUrl = game.status === "playing" && game.mode.round?.state === "playing" && !isMyTurn
    ? game.mode.round.track?.previewUrl
    : null;

  useEffect(() => {
    if (!previewUrl) return;
    const audio = new Audio(previewUrl);
    audio.loop = true;
    audio.play().catch(() => {});
    return () => audio.pause();
  }, [previewUrl]);
}

function useAccentColor(albumArt: string | undefined) {
  const [color, setColor] = useState(DEFAULT_ACCENT);
  useEffect(() => {
    let cancelled = false;
    (albumArt ? extractAccentColor(albumArt) : Promise.resolve(DEFAULT_ACCENT)).then(c => { if (!cancelled) setColor(c); });
    return () => { cancelled = true; };
  }, [albumArt]);
  return color;
}

/** The current song's cover, for page backgrounds. */
export function currentCover(game: Game): string | undefined {
  return getMode(game.mode.id).currentCover(game.mode);
}

function HostMenu({ game, controls, onEnded }: { game: Game; controls: GameControls; onEnded?: () => void }) {
  const [open, setOpen] = useState(false);
  const { InGameSettings } = getModeUI(game.mode.id);
  return (
    <div className="fixed top-4 right-4 z-20">
      <button onClick={() => setOpen(o => !o)} className="p-2 text-gray-500 hover:text-gray-300 transition" aria-label="Spielmenü">
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 bg-gray-950 border border-gray-800 rounded-xl p-4 w-64 shadow-xl z-10 flex flex-col gap-4">
            {InGameSettings && game.status === "playing" && <InGameSettings game={game} controls={controls} />}
            <button
              onClick={async () => { await controls.api.deleteGame(); onEnded?.(); }}
              className="text-left text-sm text-red-400 hover:text-red-300 transition"
            >
              Spiel beenden
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** The complete game UI for one player — host and guests alike. */
export function GameView({ game, controls, myId, playback, notice, onEnded }: Props) {
  const mode = getMode(game.mode.id);
  const modeUI = getModeUI(game.mode.id);
  const accentColor = useAccentColor(mode.currentCover(game.mode));
  const playbackMs = usePlaybackProgress(playback, mode.currentTrackId(game.mode));
  usePreviewAudio(game, myId);
  const isHost = game.hostPlayerId === myId;

  return (
    <div className="relative z-10 w-full max-w-xs flex flex-col items-center gap-5">
      {isHost && <HostMenu game={game} controls={controls} onEnded={onEnded} />}

      {game.status === "lobby" ? (
        <GameLobby game={game} controls={controls} myId={myId} />
      ) : game.status === "finished" ? (
        <>
          <Scoreboard
            players={game.players}
            scores={game.scores}
            myId={myId}
            guessedSongs={modeUI.playerSongs?.(game)}
            accentColor={accentColor}
            expandAll
            currentRound={game.currentRound}
            settings={game.settings}
          />
          {isHost && (
            <button
              onClick={() => controls.act({ type: "reset" })}
              className="text-sm font-light text-white/80 hover:text-white border border-gray-800 hover:border-gray-600 px-4 py-2 rounded-lg transition"
            >
              Neues Spiel
            </button>
          )}
        </>
      ) : (
        <modeUI.Round game={game} controls={controls} myId={myId} accentColor={accentColor} playbackMs={playbackMs} />
      )}

      {notice && (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-xs w-[calc(100%-2rem)] text-center text-sm text-red-300 bg-gray-950/95 border border-red-900/60 rounded-lg px-4 py-2 shadow-xl">
          {notice}
        </div>
      )}
    </div>
  );
}
