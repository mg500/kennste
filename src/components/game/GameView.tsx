"use client";

import { useEffect, useState } from "react";
import { MonitorPlay } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Kbd, useHotkeys } from "@/components/ui/hotkeys";
import { Pill } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useMediaQuery } from "@/components/ui/useMediaQuery";
import { getMode } from "@/lib/game/modes";
import type { Game } from "@/lib/game/types";
import type { GameControls, ReceivedPlayback } from "@/lib/game/useGameSession";
import { BuildInfo } from "@/components/BuildInfo";
import { DeviceSheet } from "./DeviceSheet";
import { GameLobby } from "./GameLobby";
import { getModeUI } from "./modes";
import { EndContent } from "./End";
import { findPlayer, LoadingSongs, MenuOrTheme, Screen, teamOutcome, Toast } from "./shared";
import { PointsPop } from "./RoundPoints";
import { Splash } from "./Splash";
import { TvPairSheet } from "./TvPairSheet";

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

function HostMenu({ game, controls, open, onClose, onEnded }: {
  game: Game; controls: GameControls; open: boolean; onClose: () => void; onEnded?: () => void;
}) {
  const [confirming, setConfirming] = useState<"abort" | "end" | null>(null);
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [pairOpen, setPairOpen] = useState(false);
  const { InGameSettings } = getModeUI(game.mode.id);
  const close = () => { setConfirming(null); onClose(); };
  if (devicesOpen) return <DeviceSheet game={game} controls={controls} open={open} onClose={() => setDevicesOpen(false)} />;
  if (pairOpen) return <TvPairSheet controls={controls} open={open} onClose={() => setPairOpen(false)} />;
  const playing = game.playlistIndex === undefined ? 0 : game.playlistIndex + 1;
  // In the lobby the device sits with the music and "TV verbinden" with the players
  const inLobby = game.status === "lobby";
  return (
    <Sheet open={open} onClose={close} title="Spielmenü">
      <div className="flex items-center justify-between gap-3">
        <span>Stil</span>
        <ThemeToggle />
      </div>
      {!inLobby && <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate">Wiedergabe: <span className="font-bold">{game.device?.name ?? "aktives Gerät"}</span></span>
        <Button variant="secondary" size="sm" onClick={() => setDevicesOpen(true)}>Ändern</Button>
      </div>}
      {game.status === "playing" && game.settings.songSource === "playlist" && (
        <span className="flex min-w-0 flex-col">
          <span className="truncate">Songs: <span className="font-bold">{game.playlistInfo?.name ?? "Playlist"}</span></span>
          {game.playlistTrackCount ? <span className="text-sm text-muted">{playing} von {game.playlistTrackCount} gespielt</span> : null}
        </span>
      )}
      {InGameSettings && game.status === "playing" && <InGameSettings game={game} controls={controls} />}
      {game.status === "playing" && game.mode.round?.state === "revealed" && (
        <Button variant="secondary" block onClick={() => { controls.act({ type: "next" }); close(); }}>
          Runde weiterschalten
        </Button>
      )}
      {!inLobby && <div className="grid grid-cols-2 gap-2.5">
        <Button variant="secondary" onClick={() => setPairOpen(true)}>
          <MonitorPlay size={18} aria-hidden />TV verbinden
        </Button>
        <a href={`/game/${game.id}/screen`} target="_blank" rel="noopener noreferrer"
          className="flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-surface-2 font-bold hover:border-muted">
          TV-Ansicht öffnen
        </a>
      </div>}
      {confirming === "abort" ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-bg p-4">
          <p className="font-bold">Laufendes Spiel abbrechen?</p>
          <p className="text-sm text-muted">Die Punkte gehen verloren, alle Spieler bleiben in der Lobby und ihr könnt direkt neu starten.</p>
          <div className="flex gap-2">
            <Button variant="secondary" block onClick={() => setConfirming(null)}>Weiterspielen</Button>
            <Button variant="buzz" block onClick={() => { controls.act({ type: "reset" }); close(); }}>Zur Lobby</Button>
          </div>
        </div>
      ) : confirming === "end" ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-bg p-4">
          <p className="font-bold">Spiel und Lobby wirklich schließen?</p>
          <p className="text-sm text-muted">Alle Spieler fliegen raus, der Code wird ungültig.</p>
          <div className="flex gap-2">
            <Button variant="secondary" block onClick={() => setConfirming(null)}>Abbrechen</Button>
            <Button variant="buzz" block onClick={async () => {
              // Once a game was played, everyone (the host too) gets the evening's summary; otherwise the game is gone
              const { closed } = await controls.api.closeLobby();
              if (closed) close(); else onEnded?.();
            }}>Schließen</Button>
          </div>
        </div>
      ) : (
        <>
          {game.status === "playing" && (
            <Button variant="outline" block onClick={() => setConfirming("abort")}>Spiel abbrechen – zurück zur Lobby</Button>
          )}
          <Button variant="ghost" block onClick={() => setConfirming("end")}>Lobby schließen</Button>
        </>
      )}
      <BuildInfo className="justify-center pt-1" />
    </Sheet>
  );
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
      <EndContent game={game} myId={myId} songActions={isHost ? <p className="text-center text-sm text-muted">Die Songs des Abends kannst du in der Lobby als Spotify-Playlist speichern.</p> : undefined} actions={isHost
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
