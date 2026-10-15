"use client";

import { useEffect, useState } from "react";
import { Crown, MonitorPlay } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Kbd, useHotkeys } from "@/components/ui/hotkeys";
import { Avatar, Card, Pill } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useMediaQuery } from "@/components/ui/useMediaQuery";
import { getMode } from "@/lib/game/modes";
import type { Game, Reaction } from "@/lib/game/types";
import type { GameControls, ReceivedPlayback } from "@/lib/game/useGameSession";
import { ReactionsContext } from "./Continue";
import { DeviceSheet } from "./DeviceSheet";
import { GameLobby } from "./GameLobby";
import { getModeUI } from "./modes";
import { findPlayer, LoadingSongs, MenuOrTheme, playerColor, scoreText, Screen, Standings, teamOutcome, Toast } from "./shared";

interface Props {
  game: Game;
  controls: GameControls;
  myId: string;
  playback: ReceivedPlayback | null;
  notice: string | null;
  /** Recent reactions of the other players (see ContinueBar). */
  reactions?: Reaction[];
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
  const { InGameSettings } = getModeUI(game.mode.id);
  const close = () => { setConfirming(null); onClose(); };
  if (devicesOpen) return <DeviceSheet game={game} controls={controls} open={open} onClose={() => setDevicesOpen(false)} />;
  return (
    <Sheet open={open} onClose={close} title="Spielmenü">
      <div className="flex items-center justify-between gap-3">
        <span>Stil</span>
        <ThemeToggle />
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate">Wiedergabe: <span className="font-bold">{game.device?.name ?? "aktives Gerät"}</span></span>
        <Button variant="secondary" size="sm" onClick={() => setDevicesOpen(true)}>Ändern</Button>
      </div>
      {InGameSettings && game.status === "playing" && <InGameSettings game={game} controls={controls} />}
      {game.status === "playing" && game.mode.round?.state === "revealed" && (
        <Button variant="secondary" block onClick={() => { controls.act({ type: "next" }); close(); }}>
          Runde weiterschalten
        </Button>
      )}
      <a href={`/game/${game.id}/screen`} target="_blank" rel="noopener noreferrer"
        className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-surface-2 font-bold hover:brightness-110">
        <MonitorPlay size={18} aria-hidden />TV-Ansicht öffnen
      </a>
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
            <Button variant="buzz" block onClick={async () => { await controls.api.deleteGame(); onEnded?.(); }}>Schließen</Button>
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
    </Sheet>
  );
}

function Finished({ game, controls, myId, onMenu }: { game: Game; controls: GameControls; myId: string; onMenu?: () => void }) {
  const isHost = game.hostPlayerId === myId;
  const { PlayerDetails, TeamSummary } = getModeUI(game.mode.id);
  const team = teamOutcome(game);
  const best = Math.max(0, ...game.players.map(p => game.scores[p.id] ?? 0));
  const winners = team ? game.players : game.players.filter(p => (game.scores[p.id] ?? 0) === best);
  const host = findPlayer(game, game.hostPlayerId);
  const title = team ? team.title
    : best === 0 ? "Keine Punkte – Revanche?"
    : winners.length > 1 ? "Unentschieden!"
    : winners[0].id === myId ? "Du gewinnst!" : `${winners[0].name} gewinnt!`;
  const restart = () => controls.act({ type: "reset" });
  useHotkeys({ Enter: isHost && restart });
  const note = (id: string) => [id === myId && "du", id === game.hostPlayerId && "Host"].filter(Boolean).join(" · ") || undefined;

  return (
    <Screen desktop decor={!team || team.won ? "confetti" : undefined} header={
      <div className="flex items-center justify-end">
        <Pill className="lg:h-11 lg:px-5 lg:text-base">{game.outOfSongs ? "Playlist durchgespielt" : "Spiel vorbei"}</Pill>
        <div className="flex-1" />
        <MenuOrTheme onMenu={onMenu} />
      </div>
    }>
      <div className="flex flex-1 flex-col gap-3.5 lg:grid lg:grid-cols-2 lg:items-center lg:gap-14">
        <div className="flex flex-col items-center gap-3 pt-4 text-center lg:gap-4 lg:pt-0">
          <div className="flex -space-x-3">
            {winners.map(w => (
              <span key={w.id} className="rounded-full ring-4 ring-bg lg:ring-8">
                <span className="lg:hidden"><Avatar name={w.name} color={playerColor(game, w.id)} size={88} /></span>
                <span className="hidden lg:block"><Avatar name={w.name} color={playerColor(game, w.id)} size={140} /></span>
              </span>
            ))}
          </div>
          {(!team || team.won) && <Crown size={32} className="text-primary lg:size-11" aria-hidden />}
          <h1 className="font-display text-4xl leading-tight font-extrabold lg:text-[80px] lg:leading-none">{title}</h1>
          <p className="text-muted lg:text-xl">{team ? team.subtitle : scoreText(game, best)}</p>
        </div>
        <div className="flex flex-1 flex-col gap-4 lg:flex-none lg:gap-5">
          <Card className="p-3 lg:rounded-[28px] lg:p-6">
            {team && TeamSummary ? <TeamSummary game={game} /> : <>
              <h2 className="mb-2 hidden text-xl font-bold lg:block">Endstand</h2>
              <Standings game={game} highlight={winners.map(w => w.id)} note={note}
                details={PlayerDetails ? id => <PlayerDetails game={game} playerId={id} /> : undefined} />
            </>}
          </Card>
          <div className="flex-1 lg:hidden" />
          {isHost
            ? <Button size="lg" block onClick={restart}>Neues Spiel<Kbd>Enter</Kbd></Button>
            : <p className="text-center text-muted lg:text-lg">Warte auf {host?.name ?? "den Host"} für eine Revanche …</p>}
        </div>
      </div>
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
export function GameView({ game, controls, myId, playback, notice, reactions = [], onEnded }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const modeUI = getModeUI(game.mode.id);
  usePreviewAudio(game, myId);
  const isHost = game.hostPlayerId === myId;
  const onMenu = isHost ? () => setMenuOpen(true) : undefined;

  return (
    <ReactionsContext value={reactions}>
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
      <Toast message={notice} />
    </ReactionsContext>
  );
}
