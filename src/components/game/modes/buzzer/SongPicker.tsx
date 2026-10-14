"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Dices, ListPlus, Play, Search, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { GameApi } from "@/lib/game/client";
import type { Track } from "@/lib/game/types";
import { TrackRow } from "./parts";

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
    add: (track: Track) => setQueue(q => (q.length < MAX_QUEUE && !q.some(t => t.id === track.id) ? [...q, track] : q)),
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

const smallIcon = "inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:text-text disabled:opacity-25";

/**
 * Song search with queue. With `onPlay` (it's the player's turn) a song can be played right away;
 * without it, songs can only be queued for later.
 */
export function SongPicker({ api, gameId, playerId, onPlay }: {
  api: GameApi;
  gameId: string;
  playerId: string;
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
    <div className="flex w-full flex-col gap-4">
      {queue.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="queue-heading">
          <h2 id="queue-heading" className="font-bold">Deine Warteschlange</h2>
          <ol className="flex flex-col gap-1.5">
            {queue.map((track, i) => (
              <li key={track.id}>
                <TrackRow track={track}>
                  <div className="flex shrink-0 items-center">
                    <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Nach oben" className={smallIcon}><ChevronUp size={18} aria-hidden /></button>
                    <button onClick={() => move(i, 1)} disabled={i === queue.length - 1} aria-label="Nach unten" className={smallIcon}><ChevronDown size={18} aria-hidden /></button>
                    {onPlay && (
                      <button onClick={() => { onPlay(track); remove(i); setSelected(null); }} aria-label={`${track.name} abspielen`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-on-accent">
                        <Play size={16} aria-hidden fill="currentColor" />
                      </button>
                    )}
                    <button onClick={() => remove(i)} aria-label="Entfernen" className={smallIcon}><X size={16} aria-hidden /></button>
                  </div>
                </TrackRow>
              </li>
            ))}
          </ol>
        </section>
      )}

      {(onPlay || canQueue) && (
        <div className="flex gap-2">
          <label className="relative flex-1">
            <span className="sr-only">Song suchen</span>
            <Search size={18} aria-hidden className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
            <input
              type="search" value={query} onChange={e => { setQuery(e.target.value); setSelected(null); }}
              placeholder={onPlay ? "Song suchen…" : "Song vormerken…"}
              autoFocus={!!onPlay}
              className="h-13 w-full rounded-2xl border-2 border-surface-2 bg-surface pr-4 pl-11 text-text placeholder:text-muted focus:border-primary focus:outline-none"
            />
          </label>
          <button onClick={pickRandom} disabled={randomLoading} aria-label="Zufälliger Song"
            className="inline-flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-surface text-text transition hover:brightness-125 disabled:opacity-40">
            <Dices size={22} aria-hidden />
          </button>
        </div>
      )}

      {selected && (
        <div className="flex flex-col gap-3 rounded-card bg-surface p-3">
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1"><TrackRow track={selected} /></div>
            <button onClick={() => setSelected(null)} aria-label="Auswahl verwerfen" className={smallIcon}><X size={18} aria-hidden /></button>
          </div>
          <div className="flex gap-2">
            {onPlay && (
              <Button block onClick={() => { onPlay(selected); setSelected(null); }}>
                <Play size={18} aria-hidden fill="currentColor" />Abspielen
              </Button>
            )}
            {canQueue && (
              <Button variant="secondary" block onClick={() => { add(selected); setSelected(null); }}>
                <ListPlus size={18} aria-hidden />Vormerken
              </Button>
            )}
          </div>
        </div>
      )}

      {!selected && results.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {results.map(t => <li key={t.id}><TrackRow track={t} onClick={() => select(t)} /></li>)}
        </ul>
      )}
    </div>
  );
}
