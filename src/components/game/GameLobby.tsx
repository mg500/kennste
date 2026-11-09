"use client";

import { useState } from "react";
import { Check, MonitorPlay, Plus, QrCode as QrIcon, Share2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Avatar, Segmented } from "@/components/ui/primitives";
import { QrCode } from "@/components/ui/QrCode";
import { Sheet } from "@/components/ui/Sheet";
import type { Game, Player } from "@/lib/game/types";
import type { GameControls, ReceivedPlayback } from "@/lib/game/useGameSession";
import { EveningSongs } from "./EveningSongs";
import { GameCard, GuestModeCard, missingPlaylist } from "./LobbyGame";
import { MusicRow } from "./LobbyMusic";
import { TvPairSheet } from "./TvPairSheet";
import { findPlayer, MenuOrTheme, playerColor, Screen } from "./shared";

export { PlaylistPicker, ruleChips } from "./LobbyGame";

interface Props {
  game: Game;
  controls: GameControls;
  myId: string;
  playback?: ReceivedPlayback | null;
  onMenu?: () => void;
}

function joinUrl(gameId: string) {
  return typeof window === "undefined" ? `/game/${gameId}` : `${window.location.origin}/game/${gameId}`;
}

function ShareButton({ gameId }: { gameId: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = joinUrl(gameId);
    if (navigator.share) {
      await navigator.share({ url, title: "Spiel beitreten" }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  return (
    <Button variant="secondary" size="sm" onClick={share}>
      {copied ? <Check size={16} aria-hidden /> : <Share2 size={16} aria-hidden />}
      {copied ? "Kopiert" : "Link teilen"}
    </Button>
  );
}

function TvLink({ gameId, className = "" }: { gameId: string; className?: string }) {
  return (
    <a href={`/game/${gameId}/screen`} target="_blank" rel="noopener noreferrer"
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border-2 border-surface-2 px-3 text-sm font-bold hover:border-muted ${className}`}>
      <MonitorPlay size={16} aria-hidden />TV-Ansicht
    </a>
  );
}

/** QR code and code to join — in a sheet on phones, always visible in the desktop layout. */
function InviteSheet({ game, open, onClose, onPairTv }: { game: Game; open: boolean; onClose: () => void; onPairTv?: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Mitspieler einladen">
      <div className="flex flex-col items-center gap-3 text-center">
        <QrCode value={joinUrl(game.id)} size={200} />
        <span className="text-sm text-muted">Scannen oder Code eingeben</span>
        <span className="font-display text-4xl font-extrabold tracking-[0.12em] uppercase">{game.id}</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5 [&>*]:h-13">
        <ShareButton gameId={game.id} />
        {onPairTv
          ? <Button variant="outline" size="sm" onClick={onPairTv}><MonitorPlay size={16} aria-hidden />TV verbinden</Button>
          : <TvLink gameId={game.id} />}
      </div>
    </Sheet>
  );
}

function InviteInline({ game, isHost }: { game: Game; isHost: boolean }) {
  return (
    <div className="flex items-center gap-4.5">
      <QrCode value={joinUrl(game.id)} size={isHost ? 120 : 96} />
      <div className="flex min-w-0 flex-col gap-2">
        <span className="text-sm text-muted">{isHost ? "Mitspielen: scannen oder Code" : "Noch jemand? Code weitergeben"}</span>
        <span className={`font-display leading-none font-extrabold tracking-[0.12em] uppercase ${isHost ? "text-[40px]" : "text-[32px]"}`}>{game.id}</span>
        <div className="flex flex-wrap gap-2">
          <ShareButton gameId={game.id} />
          {isHost && <TvLink gameId={game.id} />}
        </div>
      </div>
    </div>
  );
}

function PlayerList({ game, myId, isHost, act, onInvite, onPairTv }: {
  game: Game; myId: string; isHost: boolean; act: GameControls["act"]; onInvite: () => void; onPairTv: () => void;
}) {
  const [managing, setManaging] = useState<Player | null>(null);
  const viewerCount = game.viewers.length;
  const screens = game.connectedScreens ?? 0;
  const managedIsViewer = !!managing && game.viewers.includes(managing.id);
  const manage = (action: Parameters<GameControls["act"]>[0]) => { void act(action); setManaging(null); };

  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="players-heading">
      <div className="flex items-baseline justify-between">
        <h2 id="players-heading" className="text-lg font-bold">Spieler</h2>
        <span className="text-sm text-muted">
          {game.players.length - viewerCount} spielen{viewerCount > 0 && ` · ${viewerCount} schau${viewerCount === 1 ? "t" : "en"} zu`}
        </span>
      </div>
      <ul className="flex flex-wrap gap-2">
        {game.players.map(p => {
          const isViewer = game.viewers.includes(p.id);
          const isPlayerHost = p.id === game.hostPlayerId;
          const note = isPlayerHost ? "Host" : p.id === myId ? "du" : isViewer ? "schaut zu" : null;
          const content = (
            <>
              <Avatar name={p.name} color={playerColor(game, p.id)} size={34} />
              <span className="font-medium">{p.name}</span>
              {note && <span className={`text-xs font-bold ${isPlayerHost ? "text-primary-text" : "text-muted"}`}>{note}</span>}
              {isViewer && note !== "schaut zu" && <span className="text-xs font-bold text-muted">schaut zu</span>}
            </>
          );
          const chip = `inline-flex h-12 items-center gap-2 rounded-full border-2 pr-3.5 pl-1 ${isViewer ? "border-dashed border-surface-2" : "border-transparent bg-surface lg:bg-bg"}`;
          return (
            <li key={p.id}>
              {isHost && !isPlayerHost
                ? <button onClick={() => setManaging(p)} aria-label={`${p.name}${isViewer ? " (schaut zu)" : ""} verwalten`} className={`${chip} hover:border-muted`}>{content}</button>
                : <span className={chip}>{content}</span>}
            </li>
          );
        })}
        <li className="lg:hidden">
          <button onClick={onInvite} className="inline-flex h-12 items-center gap-1.5 rounded-full border-2 border-dashed border-surface-2 px-4 font-bold text-muted hover:text-text">
            <Plus size={18} aria-hidden />Einladen
          </button>
        </li>
        {/* On phones the host connects the TV from the header */}
        {isHost && screens === 0 && (
          <li className="hidden lg:block">
            <button onClick={onPairTv} className="inline-flex h-12 items-center gap-2 rounded-full border-2 border-dashed border-surface-2 px-4 font-bold text-muted hover:text-text">
              <MonitorPlay size={18} aria-hidden />TV verbinden
            </button>
          </li>
        )}
      </ul>
      {screens > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
          <span className="inline-flex items-center gap-2 text-sm font-bold text-positive-text" role="status">
            <span aria-hidden className="h-2 w-2 rounded-full bg-positive" />
            {screens === 1 ? "TV-Ansicht verbunden" : `${screens} TV-Ansichten verbunden`}
          </span>
          {/* What the TV shows: right where the host looks for the TV */}
          {isHost && (
            <Segmented small label="Auf dem TV" bg="bg-surface lg:bg-bg" value={game.screenView ?? "lobby"} onChange={view => act({ type: "setScreenView", view })}
              options={[{ value: "lobby", label: "Lobby" }, { value: "nowPlaying", label: "Läuft gerade" }]} />
          )}
        </div>
      )}

      <Sheet open={!!managing} onClose={() => setManaging(null)} title={managing?.name ?? ""}>
        {managing && (
          <div className="flex flex-col gap-2.5">
            <Button size="lg" variant="secondary" block onClick={() => manage({ type: "toggleViewer", playerId: managing.id })}>
              {managedIsViewer ? "Mitspielen lassen" : "Nur zuschauen lassen"}
            </Button>
            <Button size="lg" variant="outline" block className="text-buzz-text" onClick={() => manage({ type: "kick", playerId: managing.id })}>
              Aus dem Spiel entfernen
            </Button>
          </div>
        )}
      </Sheet>
    </section>
  );
}

function StartBar({ game, act }: { game: Game; act: GameControls["act"] }) {
  const missing = missingPlaylist(game);
  const activeCount = game.players.length - game.viewers.length;
  return (
    <>
      {/* Keeps the content clear of the fixed bar on phones */}
      <div className="h-24 shrink-0 lg:hidden" aria-hidden />
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-md flex-col gap-2 bg-bg px-5 pt-3 pb-6 shadow-[0_-16px_24px_var(--bg)] lg:static lg:mx-0 lg:max-w-none lg:bg-transparent lg:p-0 lg:shadow-none">
        {missing && <p className="text-center text-sm text-muted lg:text-[15px]">Wähl noch eine Playlist aus</p>}
        <Button size="lg" block disabled={activeCount === 0 || missing} onClick={() => act({ type: "countdown" })}>
          Spiel starten
        </Button>
      </div>
    </>
  );
}

function WaitingForHost({ host }: { host?: Player }) {
  return (
    <p role="status" className="flex h-15 items-center justify-center gap-2.5 rounded-card bg-surface text-muted lg:h-16 lg:text-lg">
      <span aria-hidden className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary shadow-[0_0_0_4px_color-mix(in_srgb,var(--primary)_25%,transparent)]" />
      <span>Warte auf <strong className="text-text">{host?.name ?? "den Host"}</strong> …</span>
    </p>
  );
}

export function GameLobby({ game, controls, myId, playback = null, onMenu }: Props) {
  const { act } = controls;
  const isHost = game.hostPlayerId === myId;
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pairOpen, setPairOpen] = useState(false);
  const me = findPlayer(game, myId);
  const host = findPlayer(game, game.hostPlayerId);
  const amViewer = game.viewers.includes(myId);

  const header = (
    <div className="flex items-center gap-2 lg:gap-2.5">
      <h1 className="min-w-0 flex-1 font-display text-[28px] font-extrabold lg:text-5xl">Lobby</h1>
      <button onClick={() => setInviteOpen(true)} aria-label={`Einladen, Code ${game.id}`}
        className="inline-flex h-11 items-center gap-2 rounded-full bg-surface pr-3.5 pl-3 hover:brightness-110 lg:hidden">
        <QrIcon size={18} aria-hidden />
        <span className="font-display text-[17px] font-extrabold tracking-widest uppercase">{game.id}</span>
      </button>
      {/* Usually the first step: once connected, the TV shows the code to everyone */}
      {isHost && !game.connectedScreens && (
        <button onClick={() => setPairOpen(true)} aria-label="TV verbinden"
          className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border-2 border-dashed border-surface-2 pr-3.5 pl-3 font-bold hover:border-muted max-[389px]:w-11 max-[389px]:px-0 lg:hidden">
          {/* Narrow phones: the icon alone, so the title still fits */}
          <MonitorPlay size={18} aria-hidden /><span className="max-[389px]:hidden">TV</span>
        </button>
      )}
      <MenuOrTheme onMenu={onMenu} />
    </div>
  );

  const players = <PlayerList game={game} myId={myId} isHost={isHost} act={act} onInvite={() => setInviteOpen(true)} onPairTv={() => setPairOpen(true)} />;

  return (
    <Screen desktop header={header}>
      {isHost ? (
        <div className="flex flex-1 flex-col gap-3.5 lg:grid lg:grid-cols-[minmax(0,1fr)_460px] lg:gap-7">
          <GameCard game={game} controls={controls} />
          <div className="flex flex-col gap-3.5 lg:gap-4.5">
            <div className="flex flex-col gap-4.5 lg:rounded-[28px] lg:bg-surface lg:p-6">
              <div className="hidden lg:block"><InviteInline game={game} isHost /></div>
              {players}
            </div>
            <EveningSongs game={game} myId={myId} controls={controls} />
            <MusicRow game={game} controls={controls} playback={playback} />
            <div className="flex-1" />
            <StartBar game={game} act={act} />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_460px] lg:gap-7">
          <div className="flex flex-col gap-4 lg:gap-5.5 lg:rounded-[28px] lg:bg-surface lg:p-8">
            {me && (
              <div className="flex items-center gap-3 lg:gap-4.5 lg:border-b lg:border-surface-2 lg:pb-5.5">
                <span className="lg:hidden"><Avatar name={me.name} color={playerColor(game, me.id)} size={52} /></span>
                <span className="hidden lg:block"><Avatar name={me.name} color={playerColor(game, me.id)} size={72} /></span>
                <span className="flex flex-col">
                  <span className="font-display text-2xl leading-tight font-extrabold lg:text-[40px]">
                    {amViewer ? `Du schaust zu, ${me.name}` : `Du bist dabei, ${me.name}!`}
                  </span>
                  <span className="text-muted lg:text-lg">{host?.name ?? "Der Host"} startet gleich das Spiel</span>
                </span>
              </div>
            )}
            <GuestModeCard game={game} />
            <EveningSongs game={game} myId={myId} controls={controls} />
          </div>
          <div className="flex flex-1 flex-col gap-4 lg:gap-4.5">
            <div className="lg:rounded-[28px] lg:bg-surface lg:p-6">{players}</div>
            <div className="hidden rounded-[28px] bg-surface px-6 py-5 lg:block"><InviteInline game={game} isHost={false} /></div>
            <div className="flex-1" />
            <WaitingForHost host={host} />
          </div>
        </div>
      )}
      <InviteSheet game={game} open={inviteOpen} onClose={() => setInviteOpen(false)}
        onPairTv={isHost ? () => { setInviteOpen(false); setPairOpen(true); } : undefined} />
      {isHost && <TvPairSheet controls={controls} open={pairOpen} onClose={() => setPairOpen(false)} />}
    </Screen>
  );
}
