"use client";

import { useEffect, useState } from "react";
import { Check, ChevronRight, HelpCircle, ListMusic, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Chip, Row, Segmented, Stepper } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { PLAYLIST_PAGE, type PlaylistResult } from "@/lib/game/client";
import { getMode, MODES } from "@/lib/game/modes";
import { groupOf, MODE_GROUPS, modeName, variantOf, type ModeGroup, type ModeVariant } from "@/lib/game/modes/groups";
import type { CoreSettings, Game } from "@/lib/game/types";
import type { GameControls } from "@/lib/game/useGameSession";
import { getModeUI, GROUP_COLORS } from "./modes";
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
  const group = groupOf(game.mode.id);
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
          <span className="text-lg font-bold">{group.name}</span>
          <span className="text-sm text-muted">{group.tagline}</span>
        </span>
        <Button variant="secondary" size="sm" onClick={() => setOpen("mode")}>Ändern</Button>
      </div>
      {/* Desktop: all modes side by side */}
      <div className="hidden lg:block"><ModeList game={game} act={act} /></div>
      <VariantPicker game={game} act={act} />

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
        <ModeList game={game} act={act} onDone={close} />
      </Sheet>
      <SongsSheet game={game} controls={controls} open={open === "songs"} onClose={close} />
      <RulesSheet game={game} controls={controls} open={open === "rules"} onClose={close} />
      <HelpSheet game={game} open={open === "help"} onClose={close} />
    </section>
  );
}

/** A group's icon: the one of its first variant's mode. */
function GroupIcon({ group, size, className }: { group: ModeGroup; size: number; className?: string }) {
  const ui = getModeUI(group.variants[0].mode);
  return <ui.icon size={size} aria-hidden className={className} />;
}

function ModeIcon({ game, large }: { game: Game; large?: boolean }) {
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center text-on-accent ${GROUP_COLORS[groupOf(game.mode.id).id].bg} ${large ? "h-18 w-18 rounded-[20px]" : "h-12 w-12 rounded-2xl"}`}>
      <GroupIcon group={groupOf(game.mode.id)} size={large ? 34 : 24} />
    </span>
  );
}

/** Switches to a variant: its mode, then the settings that make it this variant. */
async function pickVariant(game: Game, act: GameControls["act"], variant: ModeVariant) {
  if (game.mode.id !== variant.mode) await act({ type: "setMode", mode: variant.mode });
  if (variant.settings) await act({ type: "updateModeSettings", patch: variant.settings });
}

function ModeList({ game, act, onDone }: { game: Game; act: GameControls["act"]; onDone?: () => void }) {
  const current = groupOf(game.mode.id);
  return (
    <div role="group" aria-label="Spielmodus" className="grid gap-2.5 lg:grid-cols-4 lg:gap-3">
      {MODE_GROUPS.map(group => {
        const selected = group.id === current.id;
        const more = group.variants.length > 1;
        return (
          <button key={group.id} aria-pressed={selected} onClick={async () => { if (!selected) await pickVariant(game, act, group.variants[0]); onDone?.(); }}
            className={`flex min-h-18 items-center gap-3.5 rounded-2xl border-2 px-4 py-2.5 text-left transition lg:h-23 lg:min-h-0 lg:px-4 ${selected ? `${GROUP_COLORS[group.id].border} ${GROUP_COLORS[group.id].bg} text-on-accent` : "border-surface-2 bg-bg text-text hover:border-muted"}`}>
            <GroupIcon group={group} size={22} className="shrink-0 lg:hidden" />
            <span className="flex min-w-0 flex-col">
              <span className="font-bold lg:text-lg">{group.name}</span>
              <span className={`text-sm ${selected ? "" : "text-muted"}`}>
                <span className="lg:hidden">{more ? group.variants.map(v => v.label).join(" · ") : group.tagline}</span>
                <span className="hidden lg:inline">{more ? `${group.variants.length} Varianten` : group.tagline}</span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** The variants of the chosen mode: segments with a sentence below on phones, cards on laptops. */
function VariantPicker({ game, act }: { game: Game; act: GameControls["act"] }) {
  const { id, variants } = groupOf(game.mode.id);
  const current = variantOf(game.mode);
  if (variants.length < 2) {
    return <p className="hidden text-muted lg:block">{current.description}</p>;
  }
  return (
    <div className="flex flex-col gap-2 lg:gap-2.5">
      <span aria-hidden className="hidden text-sm font-bold text-muted lg:block">Variante</span>
      <div role="radiogroup" aria-label="Variante" className="flex gap-1 rounded-2xl bg-bg p-1 lg:grid lg:grid-cols-3 lg:gap-2.5 lg:bg-transparent lg:p-0">
        {variants.map(v => {
          const on = v === current;
          return (
            <button key={v.label} role="radio" aria-checked={on} onClick={() => !on && pickVariant(game, act, v)}
              className={`min-h-10 min-w-0 flex-1 rounded-xl px-1.5 py-1 text-sm leading-tight font-bold transition lg:flex lg:h-auto lg:min-h-26 lg:flex-col lg:gap-1.5 lg:rounded-2xl lg:border-2 lg:px-4 lg:py-3.5 lg:text-left lg:whitespace-normal ${on ? `bg-surface-2 text-text ${GROUP_COLORS[id].lgBorder}` : "text-muted hover:text-text lg:border-surface-2 lg:bg-bg"}`}>
              <span className="lg:text-[17px] lg:text-text">{v.label}</span>
              <span className="hidden text-sm leading-snug font-medium text-muted lg:block">{v.description}</span>
            </button>
          );
        })}
      </div>
      <p className="text-sm leading-snug text-muted lg:hidden">{current.description}</p>
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
      className={`flex h-14 items-center gap-3 rounded-2xl border-2 pr-3 pl-2.5 text-left transition lg:h-15 ${missing ? "border-dashed border-primary text-primary-text" : "border-surface-2 bg-bg hover:border-muted"}`}>
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
        ? <PlaylistPicker game={game} controls={controls} onPicked={onClose} />
        : <p className="text-muted">Wer dran ist, sucht einen Song aus und legt ihn für die anderen auf.</p>}
      <Button size="lg" block onClick={onClose}>Fertig</Button>
    </Sheet>
  );
}

/** Starting points for finding a playlist: each chip searches for this text. */
const PLAYLIST_IDEAS = {
  Jahrzehnt: [["60er", "Hits der 60er"], ["70er", "Hits der 70er"], ["80er", "Hits der 80er"], ["90er", "Hits der 90er"],
    ["2000er", "Hits der 2000er"], ["2010er", "Hits der 2010er"], ["Bunt gemischt", "Die größten Hits aller Zeiten"]],
  "Stimmung & Genre": [["Party", "Party Hits"], ["Rock", "Rock Klassiker"], ["Pop", "Pop Hits"], ["Deutsch", "Deutsche Hits"],
    ["Schlager", "Schlager Hits"], ["Hip-Hop", "Hip Hop Klassiker"], ["Filmmusik", "Filmmusik"]],
} as const;
const IDEAS = Object.values(PLAYLIST_IDEAS).flat();

/**
 * Finding a playlist: search, or start from a decade or genre (a random one until the host picks, so it's not
 * always the same). The host's own playlists come last and folded – they'd know the songs too well.
 * `onPicked` runs once a playlist is loaded (the sheet closes); on an error the picker stays open with it.
 */
export function PlaylistPicker({ game, controls, onPicked }: { game: Game; controls: GameControls; onPicked?: () => void }) {
  const { api, applyGame } = controls;
  const [query, setQuery] = useState("");
  const [suggested] = useState(() => IDEAS[Math.floor(Math.random() * IDEAS.length)][1]);
  const [results, setResults] = useState<{ query: string; playlists: PlaylistResult[]; more: boolean } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [own, setOwn] = useState<PlaylistResult[] | null>(null);
  const [showOwn, setShowOwn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = query.trim() || suggested;
  const typed = !!query.trim() && !IDEAS.some(([, text]) => text === query);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const playlists = await api.searchPlaylists(q);
      if (!cancelled) setResults({ query: q, playlists, more: playlists.length >= PLAYLIST_PAGE });
    }, typed ? 400 : 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [q, typed, api]);

  // Without a search term the server returns the host's own playlists
  useEffect(() => {
    if (!showOwn || own) return;
    void api.searchPlaylists("").then(setOwn);
  }, [showOwn, own, api]);

  const loadMore = async () => {
    if (!results || results.query !== q) return;
    setLoadingMore(true);
    const page = await api.searchPlaylists(q, results.playlists.length);
    setLoadingMore(false);
    setResults(r => r?.query !== q ? r : {
      query: q,
      playlists: [...r.playlists, ...page.filter(pl => !r.playlists.some(known => known.id === pl.id))],
      more: page.length >= PLAYLIST_PAGE,
    });
  };

  const load = async (playlistId: string) => {
    setLoading(true);
    setError(null);
    const { game: updated, error } = await api.loadPlaylist(playlistId);
    setLoading(false);
    if (updated) { applyGame(updated); onPicked?.(); } else setError(error ?? "Fehler beim Laden");
  };

  const selected = game.playlistTrackCount ? game.playlistInfo : undefined;
  const others = (list: PlaylistResult[] | null | undefined) => list?.filter(pl => pl.id !== game.settings.playlistId) ?? [];
  const playlists = others(results?.playlists);
  const idea = IDEAS.find(([, text]) => text === q)?.[0];
  return (
    <div className="flex flex-col gap-2">
      {selected && (
        <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-2">
          <PlaylistCover image={selected.image} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-bold">{selected.name}</span>
            <span className="text-sm text-muted">Gewählte Playlist</span>
          </span>
          <Check size={20} strokeWidth={3} className="mr-1 shrink-0 text-positive-text" aria-hidden />
        </div>
      )}
      <label htmlFor="playlist-search" className="sr-only">Playlist suchen</label>
      <div className="relative mt-1">
        <Search size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" aria-hidden />
        <input id="playlist-search" type="search" value={query} onChange={e => { setQuery(e.target.value); setError(null); }}
          placeholder="Suchen oder Spotify-Link einfügen"
          className="h-12 w-full rounded-xl border-2 border-surface-2 bg-bg pr-4 pl-11 text-text placeholder:text-muted focus:border-primary focus:outline-none" />
      </div>
      {Object.entries(PLAYLIST_IDEAS).map(([group, list]) => (
        <div key={group} role="group" aria-label={group} className="flex flex-col gap-1.5">
          <span className="text-xs font-bold tracking-wider text-muted uppercase">{group}</span>
          <div className="flex flex-wrap gap-1.5">
            {list.map(([label, text]) => (
              <button key={label} aria-pressed={query === text} onClick={() => { setQuery(query === text ? "" : text); setError(null); }}
                className={`h-9 rounded-full border-2 px-3 text-sm font-bold transition ${query === text ? "border-primary bg-surface-2" : "border-surface-2 hover:border-muted"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      ))}
      {loading && <p className="text-sm text-muted">Songs werden geladen – gleich läuft die Playlist …</p>}
      {error && <p className="text-sm font-bold text-buzz-text">{error}</p>}
      <h3 className="mt-1 text-sm font-bold text-muted">{typed ? "Treffer" : `Beliebt${idea && idea !== "Bunt gemischt" ? `: ${idea}` : ""}`}</h3>
      <PlaylistList playlists={playlists} disabled={loading} onPick={load} />
      {results?.query === q && playlists.length === 0 && <p className="text-sm text-muted">Keine Playlist gefunden.</p>}
      {results?.query === q && results.more && (
        <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Wird geladen …" : "Mehr Playlists"}</Button>
      )}

      <button onClick={() => setShowOwn(v => !v)} aria-expanded={showOwn}
        className="mt-2 flex items-center gap-3 rounded-xl border-2 border-dashed border-surface-2 px-3 py-2.5 text-left">
        <span className="flex flex-1 flex-col">
          <span className="font-bold">Eigene Playlists</span>
          <span className="text-sm text-muted">Kennst du vielleicht zu gut – eher für Runden ohne dich</span>
        </span>
        <ChevronRight size={18} aria-hidden className={`shrink-0 transition ${showOwn ? "rotate-90" : ""}`} />
      </button>
      {showOwn && <PlaylistList playlists={others(own)} disabled={loading} onPick={load} />}
    </div>
  );
}

function PlaylistList({ playlists, disabled, onPick }: { playlists: PlaylistResult[]; disabled: boolean; onPick: (id: string) => void }) {
  if (!playlists.length) return null;
  return (
    <ul className="flex flex-col gap-1 lg:grid lg:grid-cols-2">
      {playlists.map(pl => (
        <li key={pl.id}>
          <button onClick={() => onPick(pl.id)} disabled={disabled}
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
  const [help, setHelp] = useState(false);
  return (
    <section aria-labelledby="mode-heading" className="flex flex-col gap-3 rounded-card bg-surface p-4 lg:gap-4 lg:bg-transparent lg:p-0">
      <h2 id="mode-heading" className="text-xs font-bold tracking-wider text-muted uppercase lg:text-sm">Ihr spielt</h2>
      <div className="flex items-center gap-3 lg:gap-4.5">
        <span className="lg:hidden"><ModeIcon game={game} /></span>
        <span className="hidden lg:block"><ModeIcon game={game} large /></span>
        <span className="flex flex-col">
          <span className="text-xl font-bold lg:text-3xl">{modeName(game.mode)}</span>
          <span className="text-sm text-muted lg:text-[17px]">{variantOf(game.mode).description}</span>
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
