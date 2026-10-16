"use client";

import { useEffect, useState } from "react";
import { Check, ChevronRight, HelpCircle, ListMusic, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Chip, Row, Segmented, Stepper } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import type { PlaylistResult } from "@/lib/game/client";
import { getMode, MODES, type ModeId } from "@/lib/game/modes";
import type { CoreSettings, Game } from "@/lib/game/types";
import type { GameControls } from "@/lib/game/useGameSession";
import { getModeUI, UPCOMING_MODES } from "./modes";
import { applyPreset, isPresetActive } from "./modes/types";
import { scoreText } from "./shared";

/** In simultaneous modes every song is a round. */
function roundsLabel(game: Game) {
  return getMode(game.mode.id).simultaneous ? "Songs" : "Runden";
}

function goalText(game: Game) {
  const s = game.settings;
  return s.goal === "rounds" ? `${s.maxRounds} ${roundsLabel(game)}` : `Bis ${scoreText(game, s.targetScore)}`;
}

/** Short summary of the rules, e.g. "5 Runden", "Spieler wählen Songs". */
export function ruleChips(game: Game) {
  const s = game.settings;
  return [
    goalText(game),
    s.songSource === "playlist" ? (game.playlistTrackCount ? (game.playlistInfo?.name ?? "Playlist") : "Playlist fehlt") : "Spieler wählen Songs",
    ...getModeUI(game.mode.id).summary(game),
  ];
}

/** The game can't start yet: it needs songs from a playlist and none is loaded. */
export function missingPlaylist(game: Game) {
  return game.settings.songSource === "playlist" && !game.playlistTrackCount;
}

/** "Was spielen wir?" for the host: mode, length, where the songs come from and the remaining rules. */
export function GameCard({ game, controls }: { game: Game; controls: GameControls }) {
  const { act } = controls;
  const ui = getModeUI(game.mode.id);
  const [open, setOpen] = useState<"mode" | "songs" | "rules" | "help" | null>(null);
  const close = () => setOpen(null);
  const anyPreset = ui.presets.some(p => isPresetActive(game, p));
  const rules = [...(anyPreset ? [] : [goalText(game)]), ...ui.summary(game)].join(" · ");

  return (
    <section aria-labelledby="game-heading" className="flex flex-col gap-3.5 rounded-card bg-surface p-4 lg:gap-5 lg:rounded-[28px] lg:p-7">
      <h2 id="game-heading" className="sr-only text-xl font-bold lg:not-sr-only">Was spielen wir?</h2>

      {/* Phones: the chosen mode, "Ändern" opens the list */}
      <div className="flex items-center gap-3 lg:hidden">
        <ModeIcon game={game} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-lg font-bold">{MODES[game.mode.id].name}</span>
          <span className="text-sm text-muted">{ui.tagline}</span>
        </span>
        <Button variant="secondary" size="sm" onClick={() => setOpen("mode")}>Ändern</Button>
      </div>
      {/* Desktop: all modes side by side */}
      <div className="hidden lg:block"><ModeList game={game} act={act} /></div>

      <div className="flex flex-col gap-3.5 lg:grid lg:grid-cols-2 lg:gap-4">
        <div className="flex flex-col gap-2">
          <span className="hidden text-sm font-bold text-muted lg:block">Spiellänge</span>
          <div role="group" aria-label="Spiellänge" className="grid grid-cols-3 gap-2">
            {ui.presets.map(p => {
              const active = isPresetActive(game, p);
              return (
                <button key={p.id} aria-pressed={active} onClick={() => applyPreset(act, p)}
                  className={`flex h-14 flex-col items-center justify-center rounded-2xl border-2 font-bold transition lg:h-15 ${active ? "border-primary bg-primary text-on-accent" : "border-surface-2 text-text hover:border-muted"}`}>
                  {p.label}
                  <span className="text-xs font-medium">{p.sub}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="hidden text-sm font-bold text-muted lg:block">Songs</span>
          <SongsButton game={game} onClick={() => setOpen("songs")} />
        </div>
      </div>

      <div className="flex-1" />
      <div className="flex items-center gap-2 lg:border-t lg:border-surface-2 lg:pt-4">
        <span className="flex-1 text-sm text-muted lg:text-[15px]">{rules}</span>
        <button onClick={() => setOpen("help")} aria-label="So geht's"
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-surface-2 px-2.5 font-bold hover:brightness-110 lg:rounded-xl lg:px-4">
          <HelpCircle size={18} aria-hidden /><span className="hidden lg:inline">So geht&apos;s</span>
        </button>
        <Button variant="secondary" size="sm" onClick={() => setOpen("rules")}>Alle Regeln</Button>
      </div>

      <Sheet open={open === "mode"} onClose={close} title="Spielmodus">
        <ModeList game={game} act={async a => { await act(a); close(); }} />
      </Sheet>
      <SongsSheet game={game} controls={controls} open={open === "songs"} onClose={close} />
      <RulesSheet game={game} controls={controls} open={open === "rules"} onClose={close} />
      <HelpSheet game={game} open={open === "help"} onClose={close} />
    </section>
  );
}

function ModeIcon({ game, large }: { game: Game; large?: boolean }) {
  const ui = getModeUI(game.mode.id);
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center bg-buzz text-on-accent ${large ? "h-18 w-18 rounded-[20px]" : "h-12 w-12 rounded-2xl"}`}>
      <ui.icon size={large ? 34 : 24} />
    </span>
  );
}

function ModeList({ game, act }: { game: Game; act: GameControls["act"] }) {
  return (
    <div role="group" aria-label="Spielmodus" className="grid gap-2.5 lg:grid-cols-2 lg:gap-3">
      {(Object.keys(MODES) as ModeId[]).map(id => {
        const ui = getModeUI(id);
        const selected = game.mode.id === id;
        return (
          <button key={id} aria-pressed={selected} onClick={() => act({ type: "setMode", mode: id })}
            className={`flex h-18 items-center gap-3.5 rounded-2xl border-2 px-4 text-left transition lg:h-21 lg:px-5 ${selected ? "border-buzz bg-buzz text-on-accent" : "border-surface-2 bg-bg text-text hover:border-muted"}`}>
            <ui.icon size={22} aria-hidden className="shrink-0" />
            <span className="flex flex-col">
              <span className="font-bold lg:text-lg">{MODES[id].name}</span>
              <span className={`text-sm ${selected ? "" : "text-muted"}`}>{ui.tagline}</span>
            </span>
          </button>
        );
      })}
      {UPCOMING_MODES.map(name => (
        <div key={name} className="flex h-14 items-center justify-between rounded-2xl border-2 border-dashed border-surface-2 px-4 font-bold text-muted lg:h-21">
          {name}
          <span className="text-[11px] uppercase tracking-wider">Bald</span>
        </div>
      ))}
    </div>
  );
}

/** Where the songs come from — right in the card, so a missing playlist can't be overlooked. */
function SongsButton({ game, onClick }: { game: Game; onClick: () => void }) {
  const missing = missingPlaylist(game);
  const label = game.settings.songSource === "players"
    ? "Spieler wählen Songs"
    : missing ? "Playlist wählen" : `${game.playlistInfo?.name ?? "Playlist"} · ${game.playlistTrackCount} Songs`;
  return (
    <button onClick={onClick} aria-label={`Songs: ${label}`}
      className={`flex h-14 items-center gap-3 rounded-2xl border-2 pr-3 pl-2.5 text-left transition lg:h-15 ${missing ? "border-dashed border-primary text-primary" : "border-surface-2 bg-bg hover:border-muted"}`}>
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-text"><ListMusic size={18} aria-hidden /></span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs text-muted lg:hidden">Songs</span>
        <span className="truncate font-bold">{label}</span>
      </span>
      <ChevronRight size={18} aria-hidden className="shrink-0" />
    </button>
  );
}

function SongsSheet({ game, controls, open, onClose }: { game: Game; controls: GameControls; open: boolean; onClose: () => void }) {
  const s = game.settings;
  return (
    <Sheet open={open} onClose={onClose} title="Songs">
      {!MODES[game.mode.id].requiresPlaylist && (
        <Segmented value={s.songSource} onChange={v => controls.act({ type: "updateSettings", patch: { songSource: v } })}
          options={[{ value: "players", label: "Spieler wählen" }, { value: "playlist", label: "Playlist" }]} />
      )}
      {s.songSource === "playlist"
        ? <PlaylistPicker game={game} controls={controls} />
        : <p className="text-muted">Wer dran ist, sucht einen Song aus und legt ihn für die anderen auf.</p>}
      <Button size="lg" block onClick={onClose}>Fertig</Button>
    </Sheet>
  );
}

export function PlaylistPicker({ game, controls }: { game: Game; controls: GameControls }) {
  const { api, applyGame } = controls;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ query: string; playlists: PlaylistResult[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = query.trim();

  // Without a search term: the host's own playlists
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const playlists = await api.searchPlaylists(q);
      if (!cancelled) setResults({ query: q, playlists });
    }, q ? 400 : 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [q, api]);

  const load = async (playlistId: string) => {
    setLoading(true);
    setError(null);
    const { game: updated, error } = await api.loadPlaylist(playlistId);
    if (updated) { applyGame(updated); setQuery(""); } else setError(error ?? "Fehler beim Laden");
    setLoading(false);
  };

  const selected = game.playlistTrackCount ? game.playlistInfo : undefined;
  const playlists = results?.playlists.filter(pl => pl.id !== game.settings.playlistId) ?? [];
  return (
    <div className="flex flex-col gap-2">
      {selected && (
        <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-2">
          <PlaylistCover image={selected.image} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-bold">{selected.name}</span>
            <span className="text-sm text-muted">Gewählte Playlist</span>
          </span>
          <Check size={20} strokeWidth={3} className="mr-1 shrink-0 text-positive" aria-hidden />
        </div>
      )}
      <label htmlFor="playlist-search" className="mt-1 font-bold">{selected ? "Andere Playlist suchen" : "Playlist suchen"}</label>
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" aria-hidden />
        <input id="playlist-search" type="search" value={query} onChange={e => { setQuery(e.target.value); setError(null); }}
          placeholder="Name oder Spotify-Link" aria-describedby="playlist-search-hint"
          className="h-12 w-full rounded-xl border-2 border-surface-2 bg-bg pr-4 pl-11 text-text placeholder:text-muted focus:border-primary focus:outline-none" />
      </div>
      <p id="playlist-search-hint" className="text-sm text-muted">Tippe einen Namen ein, z. B. „Hits der 90er“, oder füge einen Spotify-Link ein.</p>
      {loading && <p className="text-sm text-muted">Songs werden geladen – die Musik setzt dabei kurz aus …</p>}
      {error && <p className="text-sm font-bold text-buzz">{error}</p>}
      {playlists.length > 0 && (
        <>
          <h3 className="mt-1 text-sm font-bold text-muted">{results?.query ? "Treffer" : "Deine Playlists"}</h3>
          <ul className="flex flex-col gap-1">
            {playlists.map(pl => (
              <li key={pl.id}>
                <button onClick={() => load(pl.id)} disabled={loading}
                  className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-surface-2 disabled:opacity-50">
                  <PlaylistCover image={pl.image} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{pl.name}</span>
                    <span className="truncate text-sm text-muted">{[pl.owner, pl.trackCount ? `${pl.trackCount} Songs` : ""].filter(Boolean).join(" · ")}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {results?.query && results.query === q && playlists.length === 0 && <p className="text-sm text-muted">Keine Playlist gefunden.</p>}
    </div>
  );
}

function PlaylistCover({ image }: { image: string | null }) {
  return image
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={image} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
    : <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-2"><ListMusic size={18} aria-hidden /></span>;
}

/** Everything else: goal, order and the mode's own settings (length presets and songs are in the card). */
function RulesSheet({ game, controls, open, onClose }: { game: Game; controls: GameControls; open: boolean; onClose: () => void }) {
  const ui = getModeUI(game.mode.id);
  const s = game.settings;
  const update = (patch: Partial<CoreSettings>) => controls.act({ type: "updateSettings", patch });
  return (
    <Sheet open={open} onClose={onClose} title="Regeln anpassen">
      <div className="flex flex-col">
        <Row label="Spielziel">
          <Segmented value={s.goal} onChange={v => update({ goal: v })}
            options={[{ value: "rounds", label: roundsLabel(game) }, { value: "score", label: getMode(game.mode.id).scoreUnit?.many ?? "Punkte" }]} />
        </Row>
        {s.goal === "rounds" ? (
          <Row label={roundsLabel(game)}>
            <Stepper label={roundsLabel(game)} value={s.maxRounds} min={1} max={20} onChange={v => update({ maxRounds: v })} />
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

function HelpSheet({ game, open, onClose }: { game: Game; open: boolean; onClose: () => void }) {
  const ui = getModeUI(game.mode.id);
  return (
    <Sheet open={open} onClose={onClose} title="So geht's">
      <div className="flex flex-col gap-3 leading-relaxed text-muted [&_strong]:text-text">
        <ui.Rules />
      </div>
      <Button size="lg" block onClick={onClose}>Alles klar</Button>
    </Sheet>
  );
}

/** For everyone but the host: what will be played, read-only. */
export function GuestModeCard({ game }: { game: Game }) {
  const ui = getModeUI(game.mode.id);
  const [help, setHelp] = useState(false);
  return (
    <section aria-labelledby="mode-heading" className="flex flex-col gap-3 rounded-card bg-surface p-4 lg:gap-4 lg:bg-transparent lg:p-0">
      <h2 id="mode-heading" className="text-xs font-bold tracking-wider text-muted uppercase lg:text-sm">Ihr spielt</h2>
      <div className="flex items-center gap-3 lg:gap-4.5">
        <span className="lg:hidden"><ModeIcon game={game} /></span>
        <span className="hidden lg:block"><ModeIcon game={game} large /></span>
        <span className="flex flex-col">
          <span className="text-xl font-bold lg:text-3xl">{MODES[game.mode.id].name}</span>
          <span className="text-sm text-muted lg:text-[17px]">{ui.tagline}</span>
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 lg:gap-2">
        {ruleChips(game).map(c => <Chip key={c}>{c}</Chip>)}
      </div>
      <Button variant="outline" onClick={() => setHelp(true)} className="lg:hidden">
        <HelpCircle size={18} aria-hidden />So geht&apos;s
      </Button>
      <div className="hidden flex-1 lg:block" />
      <div className="hidden items-center gap-3.5 border-t border-surface-2 pt-4 lg:flex">
        <span className="flex-1 text-[15px] text-muted">Am Laptop spielst du mit der Tastatur – die Tasten stehen an den Buttons.</span>
        <Button variant="secondary" size="sm" onClick={() => setHelp(true)}>So geht&apos;s</Button>
      </div>
      <HelpSheet game={game} open={help} onClose={() => setHelp(false)} />
    </section>
  );
}
