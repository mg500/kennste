"use client";

import { useEffect, useState } from "react";
import { GameLobby } from "./GameLobby";
import { DEFAULT_ACCENT } from "./parts";
import { RoundView } from "./RoundView";
import { Scoreboard } from "./Scoreboard";
import { extractAccentColor } from "@/lib/accentColor";
import type { Game } from "@/lib/game/types";
import { usePlaybackProgress, type GameControls, type ReceivedPlayback } from "@/lib/game/useGameSession";

interface Props {
  game: Game;
  controls: GameControls;
  myId: string;
  playback: ReceivedPlayback | null;
  notice: string | null;
}

/** Plays the 30s preview (if Spotify still provides one) for guessers while a round is running. */
function usePreviewAudio(game: Game, myId: string) {
  const isMyTurn = game.players[game.currentPlayerIndex]?.id === myId;
  const previewUrl = game.status === "playing" && game.round?.state === "playing" && !isMyTurn ? game.round.previewUrl : null;

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

/** The complete game UI for one player — used by both the host and the join page. */
export function GameView({ game, controls, myId, playback, notice }: Props) {
  const accentColor = useAccentColor(game.round?.albumArt);
  const playbackMs = usePlaybackProgress(playback, game.round?.trackId);
  usePreviewAudio(game, myId);
  const isHost = game.hostPlayerId === myId;

  return (
    <div className="relative z-10 w-full max-w-xs flex flex-col items-center gap-5">
      {game.status === "lobby" ? (
        <GameLobby game={game} controls={controls} myId={myId} />
      ) : game.status === "finished" ? (
        <>
          <Scoreboard
            players={game.players}
            scores={game.scores}
            myId={myId}
            guessedSongs={game.guessedSongs}
            accentColor={accentColor}
            expandAll
            currentRound={game.currentRound}
            maxRounds={game.settings.gameMode !== "bestOf" ? game.settings.maxRounds : undefined}
            bestOf={game.settings.gameMode === "bestOf" ? game.settings.bestOf : undefined}
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
        <RoundView game={game} controls={controls} myId={myId} accentColor={accentColor} playbackMs={playbackMs} />
      )}

      {notice && (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-xs w-[calc(100%-2rem)] text-center text-sm text-red-300 bg-gray-950/95 border border-red-900/60 rounded-lg px-4 py-2 shadow-xl">
          {notice}
        </div>
      )}
    </div>
  );
}
