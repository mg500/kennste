"use client";

import { useEffect, useRef, useState } from "react";
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

/** Something a player keeps in localStorage per game, so it survives reloads and turn changes. */
function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : initial; } catch { return initial; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }, [key, value]);
  return [value, setValue] as const;
}

/** Search results page by page: the first page after a short pause, more with `loadMore` (e.g. on scroll). */
function useTrackSearch(api: GameApi, query: string) {
  const [state, setState] = useState<{ query: string; results: Track[]; more: boolean }>({ query: "", results: [], more: false });
  const loading = useRef(false);
  const q = query.trim();
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const page = q.length < 2 ? { tracks: [], more: false } : await api.searchTracks(q);
      if (!cancelled) setState({ query: q, results: page.tracks, more: page.more });
    }, q.length < 2 ? 0 : 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [api, q]);

  const current = state.query === q;
  const loadMore = async () => {
    if (!current || !state.more || loading.current) return;
    loading.current = true;
    try {
      const page = await api.searchTracks(q, state.results.length);
      setState(s => s.query !== q ? s : {
        query: q,
        results: [...s.results, ...page.tracks.filter(t => !s.results.some(r => r.id === t.id))],
        more: page.more,
      });
    } finally {
      loading.current = false;
    }
  };
  return { results: current ? state.results : [], more: current && state.more, loadMore };
}

/** Calls `onVisible` whenever the element scrolls into view (the end of the result list). */
function useOnVisible(onVisible: () => void) {
  const ref = useRef<HTMLLIElement>(null);
  const callback = useRef(onVisible);
  useEffect(() => { callback.current = onVisible; });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) callback.current(); }, { rootMargin: "200px" });
    observer.observe(el);
    return () => observer.disconnect();
  });
  return ref;
}

const smallIcon = "inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:text-text disabled:opacity-25";

/**
 * Song search with queue. With `onPlay` (it's the player's turn) a song can be played right away;
 * without it, songs can only be queued for later.
 */
export function SongPicker({ api, gameId, playerId, played = [], onPlay }: {
  api: GameApi;
  gameId: string;
  playerId: string;
  /** Songs that already ran in this game and can't be picked again. */
  played?: string[];
  onPlay?: (track: Track) => void;
}) {
  // Kept per game and player: a search started while someone else's song played is still there next time
  const [query, setQuery] = useStored(`song-search-${gameId}-${playerId}`, "");
  const [selected, setSelected] = useStored<Track | null>(`song-selected-${gameId}-${playerId}`, null);
  const [randomLoading, setRandomLoading] = useState(false);
  const { results, more, loadMore } = useTrackSearch(api, query);
  const end = useOnVisible(() => void loadMore());
  const { queue, add, remove, move } = useQueue(gameId, playerId);
  const canQueue = queue.length < MAX_QUEUE;
  const playedNote = (track: Track) => (played.includes(track.id) ? "lief schon" : undefined);

  const select = (track: Track) => setSelected(track);
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
                <TrackRow track={track} note={playedNote(track)}>
                  <div className="flex shrink-0 items-center">
                    <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Nach oben" className={smallIcon}><ChevronUp size={18} aria-hidden /></button>
                    <button onClick={() => move(i, 1)} disabled={i === queue.length - 1} aria-label="Nach unten" className={smallIcon}><ChevronDown size={18} aria-hidden /></button>
                    {onPlay && !playedNote(track) && (
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
            <div className="min-w-0 flex-1"><TrackRow track={selected} note={playedNote(selected)} /></div>
            <button onClick={() => setSelected(null)} aria-label="Auswahl verwerfen" className={smallIcon}><X size={18} aria-hidden /></button>
          </div>
          <div className="flex gap-2">
            {onPlay && !playedNote(selected) && (
              <Button block onClick={() => { onPlay(selected); setSelected(null); }}>
                <Play size={18} aria-hidden fill="currentColor" />Abspielen
              </Button>
            )}
            {canQueue && !playedNote(selected) && (
              <Button variant="secondary" block onClick={() => { add(selected); setSelected(null); }}>
                <ListPlus size={18} aria-hidden />Vormerken
              </Button>
            )}
          </div>
        </div>
      )}

      {!selected && results.length > 0 && (
        <ul className="flex flex-col gap-0.5" aria-label="Suchergebnisse">
          {results.map(t => <li key={t.id}><TrackRow track={t} note={playedNote(t)} onClick={() => select(t)} /></li>)}
          {more && (
            <li ref={end} className="flex justify-center py-2">
              <Button variant="ghost" size="sm" onClick={() => void loadMore()}>Mehr Ergebnisse</Button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
