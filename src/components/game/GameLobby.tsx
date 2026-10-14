"use client";

import { useEffect, useState } from "react";
import { Check, HelpCircle, ListMusic, MonitorPlay, Settings, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Avatar, Card, Chip, IconButton, Row, Segmented, Stepper } from "@/components/ui/primitives";
import { QrCode } from "@/components/ui/QrCode";
import { Sheet } from "@/components/ui/Sheet";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import type { PlaylistResult } from "@/lib/game/client";
import { getMode, MODES, type ModeId } from "@/lib/game/modes";
import type { CoreSettings, Game } from "@/lib/game/types";
import type { GameControls } from "@/lib/game/useGameSession";
import { getModeUI, UPCOMING_MODES } from "./modes";
import { applyPreset, isPresetActive } from "./modes/types";
import { findPlayer, playerColor, scoreText, Screen } from "./shared";

interface Props {
  game: Game;
  controls: GameControls;
  myId: string;
  onMenu?: () => void;
}

function joinUrl(gameId: string) {
  return typeof window === "undefined" ? `/game/${gameId}` : `${window.location.origin}/game/${gameId}`;
}

function InviteCard({ gameId, screens }: { gameId: string; screens: number }) {
  const [copied, setCopied] = useState(false);
  const url = joinUrl(gameId);
  const share = async () => {
    if (navigator.share) {
      await navigator.share({ url, title: "Spiel beitreten" }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  return (
    <Card className="flex items-center gap-4 lg:gap-7 lg:p-6">
      <span className="lg:hidden"><QrCode value={url} /></span>
      <span className="hidden lg:block"><QrCode value={url} size={168} /></span>
      <div className="flex min-w-0 flex-col gap-2 lg:gap-3">
        <span className="text-sm text-muted lg:text-base">Scannen oder Code eingeben</span>
        <span className="font-display text-3xl font-extrabold uppercase tracking-[0.12em] lg:text-6xl">{gameId}</span>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={share}>
            {copied ? <Check size={16} aria-hidden /> : <Share2 size={16} aria-hidden />}
            {copied ? "Kopiert" : "Link teilen"}
          </Button>
          <a href={`/game/${gameId}/screen`} target="_blank" rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-xl border-2 border-surface-2 px-3 text-sm font-bold hover:border-muted">
            <MonitorPlay size={16} aria-hidden />Großbild
          </a>
        </div>
        {screens > 0 && (
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-positive" role="status">
            <span aria-hidden className="h-2 w-2 rounded-full bg-positive" />
            {screens === 1 ? "Großbild verbunden" : `${screens} Großbilder verbunden`}
          </span>
        )}
      </div>
    </Card>
  );
}

function ModeCards({ game, isHost, act }: { game: Game; isHost: boolean; act: GameControls["act"] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {(Object.keys(MODES) as ModeId[]).map(id => {
        const ui = getModeUI(id);
        const selected = game.mode.id === id;
        return (
          <button key={id} aria-pressed={selected} disabled={!isHost && !selected}
            onClick={() => isHost && act({ type: "setMode", mode: id })}
            className={`flex h-16 items-center gap-2.5 rounded-2xl px-3.5 text-left font-bold transition lg:h-21 lg:gap-4 lg:px-5 ${selected ? "bg-buzz text-on-accent" : "bg-surface text-text"} disabled:cursor-default`}>
            <ui.icon size={20} aria-hidden className="shrink-0" />
            <span className="flex flex-col">
              <span className="lg:text-lg">{MODES[id].name}</span>
              <span className={`hidden text-sm font-medium lg:block ${selected ? "" : "text-muted"}`}>{ui.tagline}</span>
            </span>
          </button>
        );
      })}
      {UPCOMING_MODES.map(name => (
        <div key={name} className="flex h-16 items-center justify-between rounded-2xl border-2 border-dashed border-surface-2 px-3.5 font-bold text-muted">
          {name}
          <span className="text-[11px] uppercase tracking-wider">Bald</span>
        </div>
      ))}
    </div>
  );
}

function PlayerList({ game, myId, isHost, act }: { game: Game; myId: string; isHost: boolean; act: GameControls["act"] }) {
  const viewerCount = game.viewers.length;
  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="players-heading">
      <div className="flex items-baseline justify-between">
        <h2 id="players-heading" className="text-lg font-bold">Spieler</h2>
        <span className="text-sm text-muted">
          {game.players.length - viewerCount} spielen{viewerCount > 0 && ` · ${viewerCount} schau${viewerCount === 1 ? "t" : "en"} zu`}
        </span>
      </div>
      <ul className="flex flex-col gap-1.5 lg:grid lg:grid-cols-2 lg:gap-2.5">
        {game.players.map(p => {
          const isViewer = game.viewers.includes(p.id);
          const isPlayerHost = p.id === game.hostPlayerId;
          return (
            <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-surface py-1.5 pl-2 pr-1.5">
              <Avatar name={p.name} color={playerColor(game, p.id)} />
              <span className="flex-1 font-medium">
                {p.name}
                {p.id === myId && <span className="ml-2 text-sm text-muted">du</span>}
              </span>
              {isPlayerHost && <span className="pr-2.5 text-sm font-bold text-primary">Host</span>}
              {!isPlayerHost && isHost && (
                <>
                  <button onClick={() => act({ type: "toggleViewer", playerId: p.id })}
                    className={`h-9 rounded-xl px-3 text-sm font-medium transition ${isViewer ? "bg-surface-2 text-text" : "text-muted hover:text-text"}`}>
                    {isViewer ? "Zuschauer" : "Spielt"}
                  </button>
                  <button onClick={() => act({ type: "kick", playerId: p.id })} aria-label={`${p.name} entfernen`}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:text-text">
                    <X size={16} aria-hidden />
                  </button>
                </>
              )}
              {!isPlayerHost && !isHost && isViewer && <span className="pr-2.5 text-sm text-muted">Zuschauer</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PlaylistPicker({ game, controls }: { game: Game; controls: GameControls }) {
  const { api, applyGame } = controls;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaylistResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    let cancelled = false;
    const timer = setTimeout(async () => {
      const playlists = q ? await api.searchPlaylists(q) : [];
      if (!cancelled) setResults(playlists);
    }, q ? 400 : 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, api]);

  const load = async (playlistId: string) => {
    setLoading(true);
    setError(null);
    const { game: updated, error } = await api.loadPlaylist(playlistId);
    if (updated) { applyGame(updated); setQuery(""); } else setError(error ?? "Fehler beim Laden");
    setLoading(false);
  };

  return (
    <div className="flex flex-col gap-2 py-2">
      <p className={game.playlistTrackCount ? "font-bold text-positive" : "text-muted"}>
        {game.playlistTrackCount ? `${game.playlistTrackCount} Songs geladen` : "Noch keine Playlist geladen"}
      </p>
      <label className="sr-only" htmlFor="playlist-search">Playlist suchen</label>
      <input id="playlist-search" value={query} onChange={e => { setQuery(e.target.value); setError(null); }}
        placeholder="Playlist suchen…"
        className="h-12 rounded-xl border-2 border-surface-2 bg-bg px-4 text-text placeholder:text-muted focus:border-primary focus:outline-none" />
      {loading && <p className="text-sm text-muted">Playlist wird geladen…</p>}
      {error && <p className="text-sm font-bold text-buzz">{error}</p>}
      {results.length > 0 && (
        <ul className="flex flex-col gap-1">
          {results.map(pl => (
            <li key={pl.id}>
              <button onClick={() => load(pl.id)} disabled={loading}
                className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-surface-2 disabled:opacity-50">
                {pl.image
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={pl.image} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                  : <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-2"><ListMusic size={18} aria-hidden /></span>}
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{pl.name}</span>
                  <span className="truncate text-sm text-muted">{pl.owner} · {pl.trackCount} Songs</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RulesSheet({ game, controls, open, onClose }: { game: Game; controls: GameControls; open: boolean; onClose: () => void }) {
  const ui = getModeUI(game.mode.id);
  const { act } = controls;
  const s = game.settings;
  const update = (patch: Partial<CoreSettings>) => act({ type: "updateSettings", patch });
  return (
    <Sheet open={open} onClose={onClose} title="Regeln anpassen">
      <div className="grid grid-cols-3 gap-2">
        {ui.presets.map(p => {
          const active = isPresetActive(game, p);
          return (
            <button key={p.id} aria-pressed={active} onClick={() => applyPreset(act, p)}
              className={`flex h-16 flex-col items-center justify-center rounded-2xl border-2 font-bold transition ${active ? "border-primary bg-primary text-on-accent" : "border-surface-2 text-text"}`}>
              {p.label}
              <span className="text-xs font-medium">{p.sub}</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-col">
        {!MODES[game.mode.id].requiresPlaylist && (
          <Row label="Songs">
            <Segmented value={s.songSource} onChange={v => update({ songSource: v })}
              options={[{ value: "players", label: "Spieler" }, { value: "playlist", label: "Playlist" }]} />
          </Row>
        )}
        {s.songSource === "playlist" && <PlaylistPicker game={game} controls={controls} />}
        <Row label="Spielziel">
          <Segmented value={s.goal} onChange={v => update({ goal: v })}
            options={[{ value: "rounds", label: "Runden" }, { value: "score", label: getMode(game.mode.id).scoreUnit?.many ?? "Punkte" }]} />
        </Row>
        {s.goal === "rounds" ? (
          <Row label="Runden">
            <Stepper label="Runden" value={s.maxRounds} min={1} max={20} onChange={v => update({ maxRounds: v })} />
          </Row>
        ) : (
          <Row label={`${getMode(game.mode.id).scoreUnit?.many ?? "Punkte"} zum Sieg`}>
            <Stepper label="Ziel" value={s.targetScore} min={1} max={20} onChange={v => update({ targetScore: v })} />
          </Row>
        )}
        <Row label="Reihenfolge">
          <Segmented value={s.playerOrder} onChange={v => update({ playerOrder: v })}
            options={[{ value: "sequential", label: "Reihum" }, { value: "random", label: "Zufällig" }]} />
        </Row>
        <ui.Settings game={game} controls={controls} />
      </div>
      <Button size="lg" block onClick={onClose}>Fertig</Button>
    </Sheet>
  );
}

function RulesCard({ game, isHost, onEdit, onHelp, act }: { game: Game; isHost: boolean; onEdit: () => void; onHelp: () => void; act: GameControls["act"] }) {
  const ui = getModeUI(game.mode.id);
  const s = game.settings;
  const chips = [
    s.goal === "rounds" ? `${s.maxRounds} Runden` : `Bis ${scoreText(game, s.targetScore)}`,
    s.songSource === "playlist" ? (game.playlistTrackCount ? `Playlist · ${game.playlistTrackCount} Songs` : "Playlist fehlt") : "Spieler wählen Songs",
    ...ui.summary(game),
  ];
  return (
    <Card className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Regeln</h2>
        <div className="flex gap-1.5">
          <IconButton label="So geht's" onClick={onHelp} className="!h-9 !w-9 bg-surface-2"><HelpCircle size={18} aria-hidden /></IconButton>
          {isHost && (
            <Button variant="secondary" size="sm" onClick={onEdit}>
              <Settings size={16} aria-hidden /><span className="lg:hidden">Anpassen</span><span className="hidden lg:inline">Alle Einstellungen</span>
            </Button>
          )}
        </div>
      </div>
      {isHost && (
        <div className="hidden grid-cols-3 gap-2 lg:grid">
          {ui.presets.map(p => {
            const active = isPresetActive(game, p);
            return (
              <button key={p.id} aria-pressed={active} onClick={() => applyPreset(act, p)}
                className={`flex h-16 flex-col items-center justify-center rounded-2xl border-2 font-bold transition ${active ? "border-primary bg-primary text-on-accent" : "border-surface-2 text-text hover:border-muted"}`}>
                {p.label}
                <span className="text-xs font-medium">{p.sub}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {chips.map(c => <Chip key={c}>{c}</Chip>)}
      </div>
    </Card>
  );
}

export function GameLobby({ game, controls, myId, onMenu }: Props) {
  const { act } = controls;
  const isHost = game.hostPlayerId === myId;
  const [rulesOpen, setRulesOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const ui = getModeUI(game.mode.id);
  const host = findPlayer(game, game.hostPlayerId);
  const activeCount = game.players.length - game.viewers.length;
  const missingPlaylist = game.settings.songSource === "playlist" && !game.playlistTrackCount;

  const header = (
    <div className="flex items-center justify-between gap-2">
      <h1 className="font-display text-3xl font-extrabold lg:text-5xl">Lobby</h1>
      {onMenu
        ? <IconButton label="Spielmenü" onClick={onMenu}><Settings size={18} aria-hidden /></IconButton>
        : <ThemeToggle />}
    </div>
  );

  return (
    <Screen desktop header={header}>
      <div className="flex flex-1 flex-col gap-3.5 lg:grid lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-7">
        <div className="flex flex-col gap-3.5 lg:gap-6">
          <InviteCard gameId={game.id} screens={game.connectedScreens ?? 0} />
          <ModeCards game={game} isHost={isHost} act={act} />
          <PlayerList game={game} myId={myId} isHost={isHost} act={act} />
        </div>
        <div className="flex flex-1 flex-col gap-3.5 lg:gap-5">
          <RulesCard game={game} isHost={isHost} act={act} onEdit={() => setRulesOpen(true)} onHelp={() => setHelpOpen(true)} />
          <div className="flex-1" />
          {isHost ? (
            <div className="flex flex-col gap-2">
              {missingPlaylist && <p className="text-center text-sm text-muted">Lade zuerst eine Playlist unter <span className="lg:hidden">„Anpassen“</span><span className="hidden lg:inline">„Alle Einstellungen“</span>.</p>}
              <Button size="lg" block disabled={activeCount === 0 || missingPlaylist} onClick={() => act({ type: "start" })}>
                Spiel starten
              </Button>
            </div>
          ) : (
            <p className="animate-pulse text-center text-muted">Warte auf {host?.name ?? "den Host"} …</p>
          )}
        </div>
      </div>

      {isHost && <RulesSheet game={game} controls={controls} open={rulesOpen} onClose={() => setRulesOpen(false)} />}
      <Sheet open={helpOpen} onClose={() => setHelpOpen(false)} title="So geht's">
        <div className="flex flex-col gap-3 leading-relaxed text-muted [&_strong]:text-text">
          <ui.Rules />
        </div>
        <Button size="lg" block onClick={() => setHelpOpen(false)}>Alles klar</Button>
      </Sheet>
    </Screen>
  );
}
