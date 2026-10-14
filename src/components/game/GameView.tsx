"use client";

import { useEffect, useState } from "react";
import { Crown, MonitorPlay } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Avatar, Card } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { getMode } from "@/lib/game/modes";
import type { Game } from "@/lib/game/types";
import type { GameControls, ReceivedPlayback } from "@/lib/game/useGameSession";
import { GameLobby } from "./GameLobby";
import { getModeUI } from "./modes";
import { findPlayer, MenuOrTheme, playerColor, Screen, Standings, Toast } from "./shared";

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

/** The current song's cover, for page backgrounds. */
export function currentCover(game: Game): string | undefined {
  return getMode(game.mode.id).currentCover(game.mode);
}

function HostMenu({ game, controls, open, onClose, onEnded }: {
  game: Game; controls: GameControls; open: boolean; onClose: () => void; onEnded?: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const { InGameSettings } = getModeUI(game.mode.id);
  const close = () => { setConfirming(false); onClose(); };
  return (
    <Sheet open={open} onClose={close} title="Spielmenü">
      <div className="flex items-center justify-between gap-3">
        <span>Stil</span>
        <ThemeToggle />
      </div>
      {InGameSettings && game.status === "playing" && <InGameSettings game={game} controls={controls} />}
      <a href={`/game/${game.id}/screen`} target="_blank" rel="noopener noreferrer"
        className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-surface-2 font-bold hover:brightness-110">
        <MonitorPlay size={18} aria-hidden />Großbildansicht öffnen
      </a>
      {confirming ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-bg p-4">
          <p className="font-bold">Spiel wirklich beenden? Alle Spieler fliegen raus.</p>
          <div className="flex gap-2">
            <Button variant="secondary" block onClick={() => setConfirming(false)}>Abbrechen</Button>
            <Button variant="buzz" block onClick={async () => { await controls.api.deleteGame(); onEnded?.(); }}>Beenden</Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" block onClick={() => setConfirming(true)}>Spiel beenden</Button>
      )}
    </Sheet>
  );
}

function Finished({ game, controls, myId, onMenu }: { game: Game; controls: GameControls; myId: string; onMenu?: () => void }) {
  const isHost = game.hostPlayerId === myId;
  const { PlayerDetails } = getModeUI(game.mode.id);
  const best = Math.max(0, ...game.players.map(p => game.scores[p.id] ?? 0));
  const winners = game.players.filter(p => (game.scores[p.id] ?? 0) === best);
  const host = findPlayer(game, game.hostPlayerId);
  const title = best === 0 ? "Keine Punkte – Revanche?"
    : winners.length > 1 ? "Unentschieden!"
    : winners[0].id === myId ? "Du gewinnst!" : `${winners[0].name} gewinnt!`;

  return (
    <Screen decor="confetti">
      <div className="flex justify-end"><MenuOrTheme onMenu={onMenu} /></div>
      <div className="flex flex-col items-center gap-3 pt-4 text-center">
        <div className="flex -space-x-3">
          {winners.map(w => (
            <span key={w.id} className="rounded-full ring-4 ring-bg">
              <Avatar name={w.name} color={playerColor(game, w.id)} size={88} />
            </span>
          ))}
        </div>
        <Crown size={32} className="text-primary" aria-hidden />
        <h1 className="font-display text-4xl leading-tight font-extrabold">{title}</h1>
        <p className="text-muted">{best} {best === 1 ? "Punkt" : "Punkte"}</p>
      </div>
      <Card className="p-3">
        <Standings game={game} highlight={winners.map(w => w.id)}
          details={PlayerDetails ? id => <PlayerDetails game={game} playerId={id} /> : undefined} />
      </Card>
      <div className="flex-1" />
      {isHost
        ? <Button size="lg" block onClick={() => controls.act({ type: "reset" })}>Neues Spiel</Button>
        : <p className="text-center text-muted">Warte auf {host?.name ?? "den Host"} für eine Revanche …</p>}
    </Screen>
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
        <GameLobby game={game} controls={controls} myId={myId} onMenu={onMenu} />
      ) : game.status === "finished" ? (
        <Finished game={game} controls={controls} myId={myId} onMenu={onMenu} />
      ) : (
        <modeUI.Round game={game} controls={controls} myId={myId} playback={playback} onMenu={onMenu} />
      )}
      {isHost && <HostMenu game={game} controls={controls} open={menuOpen} onClose={() => setMenuOpen(false)} onEnded={onEnded} />}
      <Toast message={notice} />
    </>
  );
}
