"use client";

import { useEffect, useState } from "react";
import { ListMusic, Music, Pause, Play, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, Segmented } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import type { PlaylistResult } from "@/lib/game/client";
import type { Game, Track } from "@/lib/game/types";
import type { GameControls, ReceivedPlayback } from "@/lib/game/useGameSession";
import { DeviceIcon } from "./DeviceSheet";

/**
 * The host's music in the lobby: which device plays, what's playing (play/pause), something else to play
 * until the game starts, and whether the TV view shows the lobby or what's playing.
 */
export function MusicCard({ game, controls, playback, onDevices }: {
  game: Game;
  controls: GameControls;
  playback: ReceivedPlayback | null;
  onDevices: () => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const track = playback?.data.track;
  const playing = !!playback?.data.isPlaying;
  const send = async (body: Parameters<GameControls["api"]["music"]>[0]) => setError((await controls.api.music(body)) ?? null);

  return (
    <Card className="flex flex-col gap-3 lg:rounded-[28px] lg:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold lg:text-lg">Musik</h2>
        <button onClick={onDevices} aria-label={`Wiedergabegerät: ${game.device?.name ?? "aktives Spotify-Gerät"} – ändern`}
          className="inline-flex h-9 min-w-0 items-center gap-1.5 rounded-xl bg-surface-2 px-3 text-sm font-medium hover:brightness-125">
          <DeviceIcon type={game.device?.type} size={15} />
          <span className="truncate">{game.device?.name ?? "Aktives Gerät"}</span>
        </button>
      </div>

      {track ? (
        <div className="flex items-center gap-3">
          {track.albumArt
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={track.albumArt} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
            : <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-2"><Music size={20} aria-hidden /></span>}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-bold">{track.name}</span>
            <span className="truncate text-sm text-muted">{track.artist}</span>
          </span>
          <button onClick={() => send(playing ? { pause: true } : { resume: true })} aria-label={playing ? "Pausieren" : "Abspielen"}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-on-accent">
            {playing ? <Pause size={18} fill="currentColor" aria-hidden /> : <Play size={18} fill="currentColor" aria-hidden />}
          </button>
        </div>
      ) : (
        <p className="text-muted">Gerade läuft nichts.</p>
      )}
      {error && <p className="text-sm font-bold text-buzz">{error}</p>}

      <Button variant="secondary" block onClick={() => setSearchOpen(true)}>
        <Music size={16} aria-hidden />Musik abspielen
      </Button>
      {(game.connectedScreens ?? 0) > 0 && (
        <div className="flex items-center gap-3">
          <span className="shrink-0 text-sm text-muted">Auf dem TV</span>
          <div className="flex-1">
            <Segmented value={game.screenView ?? "lobby"} onChange={view => controls.act({ type: "setScreenView", view })}
              options={[{ value: "lobby", label: "Lobby" }, { value: "nowPlaying", label: "Läuft gerade" }]} />
          </div>
        </div>
      )}
      <MusicSheet controls={controls} open={searchOpen} onClose={() => setSearchOpen(false)}
        onPlay={body => { setSearchOpen(false); void send(body); }} />
    </Card>
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
      const [playlists, tracks] = await Promise.all([controls.api.searchPlaylists(q), controls.api.searchTracks(q)]);
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
