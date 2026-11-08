"use client";

import { useEffect, useState } from "react";
import { MonitorPlay } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Kbd, useHotkeys } from "@/components/ui/hotkeys";
import { Pill } from "@/components/ui/primitives";
import { useMediaQuery } from "@/components/ui/useMediaQuery";
import { getMode } from "@/lib/game/modes";
import type { Game } from "@/lib/game/types";
import type { GameControls, ReceivedPlayback } from "@/lib/game/useGameSession";
import { GameLobby } from "./GameLobby";
import { HostMenu } from "./HostMenu";
import { getModeUI } from "./modes";
import { EndContent } from "./End";
import { findPlayer, LoadingSongs, MenuOrTheme, Screen, teamOutcome, Toast } from "./shared";
import { PointsPop } from "./RoundPoints";
import { Splash } from "./Splash";

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
  const mode = game.mode;
  const previewUrl = game.status === "playing" && mode.id === "buzzer" && mode.round?.state === "playing" && !isMyTurn
    ? mode.round.track?.previewUrl
    : null;

  useEffect(() => {
    if (!previewUrl) return;
    const audio = new Audio(previewUrl);
    audio.loop = true;
    audio.play().catch(() => {});
    return () => audio.pause();
  }, [previewUrl]);
}

/** The current song's cover, for page backgrounds. */
export function currentCover(game: Game): string | undefined {
  return getMode(game.mode.id).currentCover(game.mode);
}

function Finished({ game, controls, myId, onMenu }: { game: Game; controls: GameControls; myId: string; onMenu?: () => void }) {
  const isHost = game.hostPlayerId === myId;
  const team = teamOutcome(game);
  const host = findPlayer(game, game.hostPlayerId);
  const restart = () => controls.act({ type: "reset" });
  useHotkeys({ Enter: isHost && restart });

  return (
    <Screen desktop decor={!team || team.won ? "confetti" : undefined} header={
      <div className="flex items-center justify-end">
        <Pill className="lg:h-11 lg:px-5 lg:text-base">{game.outOfSongs ? "Playlist durchgespielt" : "Spiel vorbei"}</Pill>
        <div className="flex-1" />
        <MenuOrTheme onMenu={onMenu} />
      </div>
    }>
      <EndContent game={game} myId={myId} songActions={isHost ? <p className="text-center text-sm text-muted">Alle gespielten Songs kannst du in der Lobby als Spotify-Playlist speichern.</p> : undefined} actions={isHost
        ? <Button size="lg" block onClick={restart} className="lg:w-auto lg:self-start lg:px-9">Neues Spiel<Kbd>Enter</Kbd></Button>
        : <p className="text-center text-muted lg:text-left lg:text-lg">Warte auf {host?.name ?? "den Host"} für eine Revanche …</p>} />
    </Screen>
  );
}

/** Viewers on a laptop or TV get a shortcut to the TV view. */
function BigScreenHint({ game, myId }: { game: Game; myId: string }) {
  const wide = useMediaQuery("(min-width: 1024px)");
  const isViewer = game.viewers.includes(myId) || !!game.viewerPlayers?.some(p => p.id === myId);
  if (!wide || !isViewer) return null;
  return (
    <a href={`/game/${game.id}/screen`}
      className="pressable fixed right-6 bottom-6 z-30 inline-flex h-14 items-center gap-2.5 rounded-full bg-primary px-6 font-bold text-on-accent shadow-xl"
      style={{ "--shade": "var(--primary-shade)" } as React.CSSProperties}>
      <MonitorPlay size={20} aria-hidden />Zur TV-Ansicht
    </a>
  );
}

/** The complete game UI for one player — host and guests alike. */
export function GameView({ game, controls, myId, playback, notice, onEnded }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const modeUI = getModeUI(game.mode.id);
  usePreviewAudio(game, myId);
  const isHost = game.hostPlayerId === myId;
  const onMenu = isHost ? () => setMenuOpen(true) : undefined;

  return (
    <>
      {game.status === "lobby" ? (
        <GameLobby game={game} controls={controls} myId={myId} playback={playback} onMenu={onMenu} />
      ) : game.status === "finished" ? (
        <Finished game={game} controls={controls} myId={myId} onMenu={onMenu} />
      ) : (
        <modeUI.Round game={game} controls={controls} myId={myId} playback={playback} onMenu={onMenu} />
      )}
      <BigScreenHint game={game} myId={myId} />
      <LoadingSongs game={game} />
      {isHost && <HostMenu game={game} controls={controls} open={menuOpen} onClose={() => setMenuOpen(false)} onEnded={onEnded} />}
      <PointsPop game={game} myId={myId} />
      <Toast message={notice} />
      <Splash game={game} onCancel={isHost ? () => void controls.act({ type: "cancelCountdown" }) : undefined} />
    </>
  );
}
