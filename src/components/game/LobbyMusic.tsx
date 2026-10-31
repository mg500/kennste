"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Ellipsis, ListMusic, Music, Pause, Play, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import type { PlaylistResult } from "@/lib/game/client";
import type { Game, Track } from "@/lib/game/types";
import type { GameControls, ReceivedPlayback } from "@/lib/game/useGameSession";
import { DeviceIcon, DeviceSheet } from "./DeviceSheet";

/**
 * The host's music in the lobby, as one row: what's playing on which device, play/pause, and behind "…"
 * the device, something else to play until the game starts, and what the TV shows.
 */
export function MusicRow({ game, controls, playback }: {
  game: Game;
  controls: GameControls;
  playback: ReceivedPlayback | null;
}) {
  const [open, setOpen] = useState<"menu" | "search" | "devices" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const track = playback?.data.track;
  const playing = !!playback?.data.isPlaying;
  const deviceName = game.device?.name ?? "Aktives Gerät";
  const send = async (body: Parameters<GameControls["api"]["music"]>[0]) => setError((await controls.api.music(body)) ?? null);

  return (
    <section aria-label="Musik" className="flex flex-col gap-2 rounded-card bg-surface py-2.5 pr-2.5 pl-3 lg:rounded-[22px]">
      <div className="flex items-center gap-3">
        {track?.albumArt
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={track.albumArt} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
          : <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-2"><Music size={18} aria-hidden /></span>}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-xs text-muted">{track ? "Läuft" : "Musik"} · {deviceName}</span>
          <span className="truncate font-bold">{track ? `${track.name} – ${track.artist}` : "Gerade läuft nichts."}</span>
        </span>
        {track && (
          <button onClick={() => send(playing ? { pause: true } : { resume: true })} aria-label={playing ? "Pausieren" : "Abspielen"}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-on-accent">
            {playing ? <Pause size={18} fill="currentColor" aria-hidden /> : <Play size={18} fill="currentColor" aria-hidden />}
          </button>
        )}
        <button onClick={() => setOpen("menu")} aria-label="Musik und Gerät"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-2 hover:brightness-125">
          <Ellipsis size={18} aria-hidden />
        </button>
      </div>
      {error && <p className="text-sm font-bold text-buzz-text">{error}</p>}

      <Sheet open={open === "menu"} onClose={() => setOpen(null)} title="Musik">
        <button onClick={() => setOpen("devices")} aria-label={`Wiedergabegerät: ${deviceName} – ändern`}
          className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3 text-left hover:brightness-110">
          <DeviceIcon type={game.device?.type} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm text-muted">Wiedergabegerät</span>
            <span className="truncate font-bold">{deviceName}</span>
          </span>
          <ChevronRight size={18} aria-hidden />
        </button>
        <Button variant="secondary" block onClick={() => setOpen("search")}>
          <Music size={16} aria-hidden />Musik abspielen
        </Button>
        <Button size="lg" block onClick={() => setOpen(null)}>Fertig</Button>
      </Sheet>
      <DeviceSheet game={game} controls={controls} open={open === "devices"} onClose={() => setOpen(null)} />
      <MusicSheet controls={controls} open={open === "search"} onClose={() => setOpen(null)}
        onPlay={body => { setOpen(null); void send(body); }} />
    </section>
  );
}

function MusicSheet({ controls, open, onClose, onPlay }: {
  controls: GameControls;
  open: boolean;
  onClose: () => void;
  onPlay: (body: { trackId: string } | { playlistId: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ playlists: PlaylistResult[]; tracks: Track[] }>({ playlists: [], tracks: [] });
  const q = query.trim();

  useEffect(() => {
    if (!q) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const [playlists, { tracks }] = await Promise.all([controls.api.searchPlaylists(q), controls.api.searchTracks(q)]);
      if (!cancelled) setResults({ playlists: playlists.slice(0, 3), tracks: tracks.slice(0, 5) });
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [q, controls.api]);

  const shown = q ? results : { playlists: [], tracks: [] };
  return (
    <Sheet open={open} onClose={onClose} title="Musik abspielen">
      <p className="text-sm text-muted">Läuft bis zum Spielstart – am besten etwas, das nicht in der Spiel-Playlist ist.</p>
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" aria-hidden />
        <label htmlFor="music-search" className="sr-only">Song oder Playlist suchen</label>
        <input id="music-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Song oder Playlist suchen"
          className="h-12 w-full rounded-xl border-2 border-surface-2 bg-bg pr-4 pl-11 text-text placeholder:text-muted focus:border-primary focus:outline-none" />
      </div>
      <ul className="flex flex-col gap-1">
        {shown.playlists.map(pl => (
          <ResultRow key={pl.id} image={pl.image} title={pl.name} sub={`Playlist${pl.owner ? ` · ${pl.owner}` : ""}`} playlist
            onClick={() => onPlay({ playlistId: pl.id })} />
        ))}
        {shown.tracks.map(t => (
          <ResultRow key={t.id} image={t.albumArt} title={t.name} sub={`Song · ${t.artist}`} onClick={() => onPlay({ trackId: t.id })} />
        ))}
      </ul>
    </Sheet>
  );
}

function ResultRow({ image, title, sub, playlist, onClick }: { image: string | null; title: string; sub: string; playlist?: boolean; onClick: () => void }) {
  const Fallback = playlist ? ListMusic : Music;
  return (
    <li>
      <button onClick={onClick} aria-label={`${title} abspielen`} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-surface-2">
        {image
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={image} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
          : <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-2"><Fallback size={18} aria-hidden /></span>}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-bold">{title}</span>
          <span className="truncate text-sm text-muted">{sub}</span>
        </span>
        <Play size={18} fill="currentColor" aria-hidden className="shrink-0" />
      </button>
    </li>
  );
}
