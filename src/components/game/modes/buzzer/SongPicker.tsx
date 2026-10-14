"use client";

import { useEffect, useState } from "react";
import type { GameApi } from "@/lib/game/client";
import type { Track } from "@/lib/game/types";
import { Divider, TrackRow } from "../../parts";

const MAX_QUEUE = 5;

/** Per-player song queue, persisted in localStorage so it survives reloads and turn changes. */
function useQueue(gameId: string, playerId: string) {
  const key = `song-queue-${gameId}-${playerId}`;
  const [queue, setQueue] = useState<Track[]>(() => {
    try { return JSON.parse(localStorage.getItem(key) ?? "[]"); } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(queue)); } catch {}
  }, [key, queue]);

  return {
    queue,
    add: (track: Track) => setQueue(q => (q.length < MAX_QUEUE ? [...q, track] : q)),
    remove: (index: number) => setQueue(q => q.filter((_, i) => i !== index)),
    move: (index: number, dir: -1 | 1) => setQueue(q => {
      const target = index + dir;
      if (target < 0 || target >= q.length) return q;
      const next = [...q];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    }),
  };
}

function useTrackSearch(api: GameApi, query: string) {
  const [results, setResults] = useState<Track[]>([]);
  useEffect(() => {
    const q = query.trim();
    let cancelled = false;
    const timer = setTimeout(async () => {
      const tracks = q.length < 2 ? [] : await api.searchTracks(q);
      if (!cancelled) setResults(tracks);
    }, q.length < 2 ? 0 : 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [api, query]);
  return results;
}

/**
 * Song search with queue. With `onPlay` (it's the player's turn) a song can be played right away;
 * without it, songs can only be queued for later.
 */
export function SongPicker({ api, gameId, playerId, accentColor, onPlay }: {
  api: GameApi;
  gameId: string;
  playerId: string;
  accentColor?: string;
  onPlay?: (track: Track) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Track | null>(null);
  const [randomLoading, setRandomLoading] = useState(false);
  const results = useTrackSearch(api, query);
  const { queue, add, remove, move } = useQueue(gameId, playerId);
  const canQueue = queue.length < MAX_QUEUE;

  const select = (track: Track) => { setSelected(track); setQuery(""); };
  const pickRandom = async () => {
    setRandomLoading(true);
    try {
      const track = await api.randomTrack();
      if (track) select(track);
    } finally {
      setRandomLoading(false);
    }
  };

  return (
    <div className="w-full flex flex-col gap-3">
      {queue.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Divider accentColor={accentColor} />
          <p className="text-xs text-gray-700 uppercase tracking-widest">Warteschlange</p>
          {queue.map((track, i) => (
            <TrackRow key={track.id + i} track={track}>
              <div className="flex items-center gap-0.5 shrink-0">
                <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Nach oben"
                  className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-gray-400 disabled:opacity-20 transition text-xs">↑</button>
                <button onClick={() => move(i, 1)} disabled={i === queue.length - 1} aria-label="Nach unten"
                  className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-gray-400 disabled:opacity-20 transition text-xs">↓</button>
                {onPlay && i === 0 && (
                  <button onClick={() => { onPlay(track); remove(0); setSelected(null); }} aria-label="Abspielen"
                    className="text-xs text-white/70 hover:text-white border border-gray-700 hover:border-gray-500 px-2 py-1 rounded transition ml-1">
                    ▶
                  </button>
                )}
                <button onClick={() => remove(i)} aria-label="Entfernen"
                  className="w-6 h-6 flex items-center justify-center text-gray-700 hover:text-gray-400 transition ml-0.5 text-xs">✕</button>
              </div>
            </TrackRow>
          ))}
        </div>
      )}

      {(onPlay || canQueue) && (
        <div className="flex items-center gap-2">
          <input
            type="text" value={query} onChange={e => { setQuery(e.target.value); setSelected(null); }}
            placeholder={onPlay ? "Song suchen…" : "Song zur Warteschlange hinzufügen…"}
            autoFocus={!!onPlay}
            className="bg-transparent border-b border-gray-800 focus:border-gray-500 px-2 py-2 text-white placeholder-gray-700 focus:outline-none flex-1 transition-colors text-sm"
          />
          <button onClick={pickRandom} disabled={randomLoading} title="Zufälliger Song"
            className="text-gray-600 hover:text-gray-400 transition disabled:opacity-30 pb-1">
            {randomLoading ? "…" : "🎲"}
          </button>
        </div>
      )}

      {selected && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 w-full px-1">
            {selected.albumArt && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selected.albumArt} alt="" className="w-10 h-10 rounded-lg" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{selected.name}</p>
              <p className="text-gray-500 text-xs truncate">{selected.artist}</p>
              {(selected.album || selected.releaseYear) && (
                <p className="text-gray-700 text-xs truncate">{selected.album}{selected.releaseYear && ` · ${selected.releaseYear}`}</p>
              )}
            </div>
            <button onClick={() => setSelected(null)} aria-label="Auswahl verwerfen" className="text-xs text-gray-600 hover:text-gray-400 transition shrink-0">✕</button>
          </div>
          <div className="flex gap-2">
            {onPlay && (
              <button onClick={() => { onPlay(selected); setSelected(null); }}
                className="flex-1 text-sm text-white/80 hover:text-white border border-gray-700 hover:border-gray-500 px-4 py-2 rounded-lg transition">
                ▶ Abspielen
              </button>
            )}
            {canQueue && (
              <button onClick={() => { add(selected); setSelected(null); }}
                className="flex-1 text-sm text-gray-500 hover:text-gray-300 border border-gray-800 hover:border-gray-600 px-4 py-2 rounded-lg transition">
                + Warteschlange
              </button>
            )}
          </div>
        </div>
      )}

      {!selected && results.length > 0 && (
        <div className="flex flex-col gap-1">
          {results.map(t => <TrackRow key={t.id} track={t} onClick={() => select(t)} />)}
        </div>
      )}
    </div>
  );
}
