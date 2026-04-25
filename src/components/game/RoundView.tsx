"use client";

import { useState, useEffect, useRef } from "react";
import { Player, Round, Track, GuessedSong, LastResult, GameSettings } from "./types";

interface Props {
  gameId: string;
  myId: string;
  players: Player[];
  currentPlayerIndex: number;
  scores: Record<string, number>;
  guessedSongs?: Record<string, GuessedSong[]>;
  lastResult?: LastResult;
  round?: Round;
  // Song search (picker only)
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchResults: Track[];
  onSongPick: (track: Track) => void;
  // Playback
  onPlay: (trackId?: string) => void;
  onPause?: () => void;
  // Actions
  onBuzz?: () => void;
  onSkip?: () => void;
  onReveal?: () => void;
  onHint?: () => void;
  onHintField?: (field: "title" | "artist" | "year") => void;
  onJudge: (action: "correct" | "wrong") => void;
  accentColor?: string;
  settings?: GameSettings;
  playbackMs?: { current: number; duration: number; isPlaying: boolean };
  currentRound?: number;
}

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function HintButton({ onClick, label, accentColor }: { onClick: () => void; label: string; accentColor?: string }) {
  const color = accentColor ?? "#1DB954";
  return (
    <div className="relative group">
      <button onClick={onClick}
        style={{ color, borderColor: color + "60" }}
        className="text-sm px-3 py-2 rounded-lg border transition hover:opacity-80">
        {label}
      </button>
      <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color }}>
        Tipp geben
      </span>
    </div>
  );
}

function PlaybackBar({ current, duration, isPlaying, accentColor }: { current: number; duration: number; isPlaying: boolean; accentColor?: string }) {
  if (!duration) return null;
  const pct = Math.min((current / duration) * 100, 100);
  return (
    <div className="w-full">
      <div className="w-full bg-gray-800 rounded-full h-1">
        <div
          className="rounded-full h-1"
          style={{
            width: `${pct}%`,
            backgroundColor: accentColor ?? "#1DB954",
            transition: isPlaying ? "width 1s linear" : "none",
          }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-600 mt-1">
        <span>{formatTime(Math.min(current, duration))}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}

const ANIM_MS = 1200;

export function Scoreboard({ players, displayedScores, popups = [], currentPlayerId, myId, skippedPlayers = [], wrongPlayers = [], guessedSongs = {}, accentColor = "#1DB954", expandAll = false, currentRound, maxRounds, bestOf }: {
  players: Player[]; displayedScores: Record<string, number>; popups?: { id: string; delta: number; key: number }[];
  currentPlayerId?: string; myId: string;
  skippedPlayers?: string[]; wrongPlayers?: string[]; guessedSongs?: Record<string, GuessedSong[]>;
  accentColor?: string; expandAll?: boolean; currentRound?: number; maxRounds?: number; bestOf?: number;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(myId);

  const sorted = [...players].sort((a, b) => (displayedScores[b.id] ?? 0) - (displayedScores[a.id] ?? 0));
  return (
    <div className="w-full flex flex-col gap-1">
      <div className="border-t mt-6 pt-5" style={{ borderColor: accentColor + "40" }}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-gray-600 text-xs tracking-widest uppercase">Punktestand</p>
        {bestOf !== undefined
          ? <p className="text-gray-700 text-xs">Bis {bestOf} Punkte</p>
          : currentRound !== undefined && (
            <p className="text-gray-700 text-xs">Runde {currentRound}{maxRounds ? ` / ${maxRounds}` : ""}</p>
          )
        }
      </div>
      {sorted.map(p => {
        const songs = guessedSongs[p.id] ?? [];
        const isExpanded = expandAll || expandedId === p.id;
        return (
          <div key={p.id}>
            <button
              onClick={() => !expandAll && setExpandedId(isExpanded ? null : p.id)}
              className={`relative flex justify-between items-center px-3 py-2 rounded-lg text-sm w-full text-left ${p.id === myId ? "bg-gray-900" : ""}`}
            >
              <span className={`flex items-center gap-2 ${p.id === currentPlayerId ? "text-white" : "text-gray-500"}`}>
                <span className={`text-xs leading-none ${p.id === currentPlayerId ? "text-green-500" : "text-white/20"}`}>▶</span>
                {p.name}
                {p.id === myId && <span className="text-gray-700 text-xs">du</span>}
                {skippedPlayers.includes(p.id) && <span className="text-gray-700 text-xs">übersprungen</span>}
                {wrongPlayers.includes(p.id) && <span className="text-red-900 text-xs">falsch</span>}
              </span>
              <span className="relative text-gray-400 tabular-nums">
                {displayedScores[p.id] ?? 0}
                {popups.filter(x => x.id === p.id).map(x => (
                  <span key={x.key} className="score-pop absolute -top-1 right-0 text-green-400 text-xs font-bold pointer-events-none whitespace-nowrap">
                    +{x.delta}
                  </span>
                ))}
              </span>
            </button>
            {isExpanded && (
              <div className="flex flex-col gap-1 px-3 pb-2">
                {songs.length === 0
                  ? <p className="text-gray-700 text-xs">Noch keine Songs erraten</p>
                  : songs.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      {s.albumArt && <img src={s.albumArt} alt="" className="w-6 h-6 rounded" />}
                      <div>
                        <p className="text-xs text-white">{s.songName}</p>
                        <p className="text-xs text-gray-600">{s.artistName}</p>
                      </div>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}

function ResultBanner({ result }: { result: LastResult }) {
  if (result.type === "correct") {
    return (
      <p className="text-green-400 text-sm text-center">
        {result.byPlayerName ? `${result.byPlayerName} hat es erraten!` : "Richtig erraten!"}
      </p>
    );
  }
  if (result.type === "wrong") {
    return (
      <p className="text-red-400 text-sm text-center">
        {result.byPlayerName ? `${result.byPlayerName} lag falsch` : "Falsch geraten"}
      </p>
    );
  }
  return <p className="text-gray-400 text-sm text-center">Song wurde aufgelöst</p>;
}

export function RoundView({
  gameId, myId, players, currentPlayerIndex, scores, guessedSongs = {}, lastResult, round,
  searchQuery, onSearchChange, searchResults, onSongPick,
  onPlay, onPause, onBuzz, onSkip, onReveal, onHint, onHintField, onJudge, accentColor, settings, playbackMs, currentRound,
}: Props) {
  const [localSelected, setLocalSelected] = useState<Track | null>(null);
  const [randomLoading, setRandomLoading] = useState(false);
  const [displayedScores, setDisplayedScores] = useState<Record<string, number>>(scores);
  const [popups, setPopups] = useState<{ id: string; delta: number; key: number }[]>([]);
  const [queue, setQueue] = useState<Track[]>([]);
  const [buzzTimeLeft, setBuzzTimeLeft] = useState<number | null>(null);
  const [playTimeLeft, setPlayTimeLeft] = useState<number | null>(null);
  const scoreKeyRef = useRef(0);
  const animatingRef = useRef(false);

  const queueKey = `song-queue-${gameId}-${myId}`;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(queueKey);
      if (stored) setQueue(JSON.parse(stored));
    } catch {}
  }, [queueKey]);

  useEffect(() => {
    try { localStorage.setItem(queueKey, JSON.stringify(queue)); } catch {}
  }, [queue, queueKey]);

  const addToQueue = (track: Track) => {
    setQueue(prev => prev.length < 5 ? [...prev, track] : prev);
  };
  const removeFromQueue = (idx: number) => {
    setQueue(prev => prev.filter((_, i) => i !== idx));
  };
  const moveInQueue = (idx: number, dir: -1 | 1) => {
    setQueue(prev => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  useEffect(() => {
    if (animatingRef.current) return;
    const newPopups: { id: string; delta: number; key: number }[] = [];
    for (const p of players) {
      const prev = displayedScores[p.id] ?? 0;
      const curr = scores[p.id] ?? 0;
      if (curr > prev) newPopups.push({ id: p.id, delta: curr - prev, key: scoreKeyRef.current++ });
    }
    if (newPopups.length === 0) return;
    animatingRef.current = true;
    setTimeout(() => {
      setPopups(prev => [...prev, ...newPopups]);
      setTimeout(() => {
        setPopups([]);
        setDisplayedScores({ ...scores });
        animatingRef.current = false;
      }, ANIM_MS);
    }, 1000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scores]);

  useEffect(() => {
    const limit = settings?.buzzTimeLimit ?? 0;
    if (round?.state !== "buzzed" || !round.buzzedAt || limit === 0) {
      setBuzzTimeLeft(null);
      return;
    }
    const tick = () => {
      const left = Math.max(0, limit - (Date.now() - round.buzzedAt!) / 1000);
      setBuzzTimeLeft(Math.ceil(left));
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [round?.state, round?.buzzedAt, settings?.buzzTimeLimit]);

  useEffect(() => {
    const limit = settings?.playTimeLimit ?? 0;
    if (round?.state !== "playing" || !round.playingAt || limit === 0) {
      setPlayTimeLeft(null);
      return;
    }
    const tick = () => {
      const left = Math.max(0, limit - (Date.now() - round.playingAt!) / 1000);
      setPlayTimeLeft(Math.ceil(left));
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [round?.state, round?.playingAt, settings?.playTimeLimit]);

  const pickRandom = async () => {
    setRandomLoading(true);
    try {
      const res = await fetch(`/api/game/${gameId}/random`);
      const data = res.ok ? await res.json() : { track: null };
      if (data.track) { setLocalSelected(data.track); onSearchChange(""); }
    } finally {
      setRandomLoading(false);
    }
  };
  const lastSongRef = useRef<{ name: string; artist: string; album?: string; releaseYear?: string; albumArt: string | null } | null>(null);

  useEffect(() => {
    if (round?.trackId && round.songName) {
      lastSongRef.current = { name: round.songName, artist: round.artistName ?? "", album: round.albumName, releaseYear: round.releaseYear, albumArt: round.albumArt ?? null };
    }
  }, [round?.trackId, round?.songName, round?.artistName, round?.albumName, round?.releaseYear, round?.albumArt]);

  const currentPlayer = players[currentPlayerIndex];
  const isMyTurn = currentPlayer?.id === myId;
  const buzzedPlayer = round?.buzzedBy ? players.find(p => p.id === round.buzzedBy) : null;
  const alreadyBuzzed = (round?.buzzCounts?.[myId] ?? 0) >= (settings?.maxBuzzesPerRound ?? 1);
  const alreadySkipped = round?.skippedPlayers.includes(myId) ?? false;
  const nonPickers = players.filter(p => p.id !== currentPlayer?.id);
  const allSkipped = nonPickers.length > 0 && nonPickers.every(p =>
    round?.skippedPlayers.includes(p.id) || round?.wrongPlayers.includes(p.id)
  );

  // Derived song info for playing state
  const playingSong = round?.trackId ? {
    id: round.trackId,
    name: round.songName ?? "",
    artist: round.artistName ?? "",
    album: round.albumName,
    releaseYear: round.releaseYear,
    albumArt: round.albumArt ?? null,
  } : null;

  // Non-picker: heading always visible, content depends on state
  if (!isMyTurn) {
    return (
      <>
        {round?.state !== "picking" && (
          <p className="text-gray-500 text-xs tracking-widest uppercase text-center w-full">
            Erkennst du {currentPlayer?.name}{currentPlayer?.name?.endsWith("s") ? "'" : "s"} Song?
          </p>
        )}

        {lastResult && <ResultBanner result={lastResult} />}

        {round?.state === "picking" && lastSongRef.current && (
          <div className="flex flex-col items-center gap-3 opacity-40">
            {lastSongRef.current.albumArt && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={lastSongRef.current.albumArt} alt="" className="w-48 h-48 rounded-xl shadow-2xl" />
            )}
            <div className="text-center">
              <p className="text-white font-bold text-lg">{lastSongRef.current.name}</p>
              <p className="text-gray-400 text-sm">{lastSongRef.current.artist}</p>
              {lastSongRef.current.releaseYear && (
                <p className="text-gray-600 text-sm">{lastSongRef.current.releaseYear}</p>
              )}
            </div>
          </div>
        )}

        {round?.state === "picking" && (
          <div className="w-full flex flex-col gap-3">
            <div className="border-t" style={{ borderColor: (accentColor ?? "#1DB954") + "40" }} />
            <p className="animate-pulse text-gray-500 text-xs tracking-widest uppercase text-center">
              {currentPlayer?.name} wählt einen Song
            </p>

            {/* Queue — nur im Spieler-Modus */}
            {settings?.songSource !== "playlist" && queue.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <div className="border-t" style={{ borderColor: (accentColor ?? "#1DB954") + "40" }} />
                <p className="text-xs text-gray-700 uppercase tracking-widest">Warteschlange</p>
                {queue.map((track, i) => (
                  <div key={track.id + i} className="flex items-center gap-2 bg-gray-900 rounded-lg px-3 py-2">
                    {track.albumArt && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={track.albumArt} alt="" className="w-8 h-8 rounded shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{track.name}</p>
                      <p className="text-xs text-gray-500 truncate">{track.artist}</p>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button onClick={() => moveInQueue(i, -1)} disabled={i === 0}
                        className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-gray-400 disabled:opacity-20 transition text-xs">↑</button>
                      <button onClick={() => moveInQueue(i, 1)} disabled={i === queue.length - 1}
                        className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-gray-400 disabled:opacity-20 transition text-xs">↓</button>
                      <button onClick={() => removeFromQueue(i)}
                        className="w-6 h-6 flex items-center justify-center text-gray-700 hover:text-gray-400 transition ml-0.5 text-xs">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Search to add to queue — nur im Spieler-Modus */}
            {settings?.songSource !== "playlist" && queue.length < 5 && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <input
                    type="text" value={searchQuery} onChange={e => onSearchChange(e.target.value)}
                    placeholder="Song zur Warteschlange hinzufügen…"
                    className="bg-transparent border-b border-gray-800 focus:border-gray-500 px-2 py-2 text-white placeholder-gray-700 focus:outline-none flex-1 transition-colors text-sm"
                  />
                  <button onClick={async () => {
                    setRandomLoading(true);
                    try {
                      const res = await fetch(`/api/game/${gameId}/random`);
                      const data = res.ok ? await res.json() : { track: null };
                      if (data.track) { setLocalSelected(data.track); onSearchChange(""); }
                    } finally { setRandomLoading(false); }
                  }} disabled={randomLoading}
                    className="text-gray-600 hover:text-gray-400 transition disabled:opacity-30 pb-1"
                    title="Zufälliger Song">
                    {randomLoading ? "…" : "🎲"}
                  </button>
                </div>
                {searchResults.length > 0 && (
                  <div className="flex flex-col gap-1 mt-1">
                    {searchResults.map(t => (
                      <button key={t.id} onClick={() => { setLocalSelected(t); onSearchChange(""); }}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-900 text-left transition">
                        {t.albumArt && <img src={t.albumArt} alt="" className="w-8 h-8 rounded" />}
                        <div>
                          <p className="text-sm text-white">{t.name}</p>
                          <p className="text-xs text-gray-600">{t.artist}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Local preview for non-picker — nur im Spieler-Modus */}
            {settings?.songSource !== "playlist" && localSelected && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3 w-full px-1">
                  {localSelected.albumArt && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={localSelected.albumArt} alt="" className="w-10 h-10 rounded-lg" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{localSelected.name}</p>
                    <p className="text-gray-500 text-xs truncate">{localSelected.artist}</p>
                  </div>
                  <button onClick={() => setLocalSelected(null)} className="text-xs text-gray-600 hover:text-gray-400 transition shrink-0">✕</button>
                </div>
                {queue.length < 5 && (
                  <button onClick={() => { addToQueue(localSelected); setLocalSelected(null); onSearchChange(""); }}
                    className="text-sm text-gray-500 hover:text-gray-300 border border-gray-800 hover:border-gray-600 px-4 py-2 rounded-lg transition">
                    + Warteschlange
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {round?.state === "playing" && (
          <div className="flex flex-col items-center gap-4 w-full">
            {playingSong && (
              <div className="flex flex-col items-center gap-3">
                {playingSong.albumArt && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={playingSong.albumArt} alt="" className="w-48 h-48 rounded-xl shadow-2xl"
                    style={round.hintRevealed ? {} : { filter: "blur(12px)" }}
                    onContextMenu={round.hintRevealed ? undefined : e => e.preventDefault()} />
                )}
                <div className="text-center" style={{ userSelect: "none", pointerEvents: "none" }}>
                  <p className="text-white font-bold text-lg" style={round.hintTitleRevealed ? {} : { filter: "blur(12px)" }}>{playingSong.name}</p>
                  <p className="text-gray-400 text-sm" style={round.hintArtistRevealed ? {} : { filter: "blur(12px)" }}>{playingSong.artist}</p>
                  {playingSong.releaseYear && (
                    <p className="text-gray-600 text-sm" style={round.hintYearRevealed ? {} : { filter: "blur(12px)" }}>
                      {playingSong.releaseYear}
                    </p>
                  )}
                </div>
              </div>
            )}
            {playbackMs && <PlaybackBar {...playbackMs} accentColor={accentColor} />}
            <div className="w-full border-t" style={{ borderColor: (accentColor ?? "#1DB954") + "40" }} />
            {!alreadyBuzzed && onBuzz ? (
              <button onClick={onBuzz}
                className="w-36 h-36 rounded-full border border-white/20 hover:border-white/60 text-white text-xl font-light transition active:scale-95">
                Buzz
              </button>
            ) : (
              <p className="text-gray-700 text-sm">Du hast bereits gebuzzert…</p>
            )}
            {onSkip && !alreadySkipped && (
              <button onClick={onSkip}
                className="text-xs text-gray-600 hover:text-gray-400 border border-gray-800 hover:border-gray-600 px-4 py-2 rounded-lg transition">
                Überspringen
              </button>
            )}
            {alreadySkipped && (
              <p className="text-gray-800 text-xs">Du hast übersprungen</p>
            )}
          </div>
        )}

        {round?.state === "buzzed" && (
          <div className="flex flex-col items-center gap-2 text-center">
            {round.buzzedBy === myId
              ? <p className="text-white">Du hast gebuzzert!</p>
              : <p className="text-gray-400">{buzzedPlayer?.name ?? "Jemand"} hat gebuzzert!</p>
            }
            {buzzTimeLeft !== null && (
              <p className={`text-3xl font-light tabular-nums ${buzzTimeLeft <= 5 ? "text-red-400" : "text-gray-400"}`}>
                {buzzTimeLeft}
              </p>
            )}
            <p className="text-gray-700 text-xs">Warte auf Auflösung…</p>
          </div>
        )}
        <Scoreboard players={players} displayedScores={displayedScores} popups={popups} currentPlayerId={currentPlayer?.id} myId={myId} skippedPlayers={round?.skippedPlayers} wrongPlayers={round?.wrongPlayers} guessedSongs={guessedSongs} accentColor={accentColor} currentRound={settings?.gameMode !== "bestOf" ? currentRound : undefined} maxRounds={settings?.gameMode !== "bestOf" ? settings?.maxRounds : undefined} bestOf={settings?.gameMode === "bestOf" ? settings?.bestOf : undefined} />
      </>
    );
  }

  // Picker — playing state: Just Playing-like view
  if (round?.state === "playing" && isMyTurn && playingSong) {
    return (
      <>
        <div className="w-full flex flex-col items-center gap-4">
          {playingSong.albumArt && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={playingSong.albumArt} alt="" className="w-48 h-48 rounded-xl shadow-2xl" />
          )}
          <div className="text-center">
            <p className="text-white font-bold text-lg">{playingSong.name}</p>
            <p className="text-gray-400 text-sm">{playingSong.artist}</p>
            {playingSong.releaseYear && (
              <p className="text-gray-600 text-sm">{playingSong.releaseYear}</p>
            )}
          </div>
          {playbackMs && <PlaybackBar {...playbackMs} accentColor={accentColor} />}
          <div className="w-full border-t pt-4" style={{ borderColor: (accentColor ?? "#1DB954") + "40" }}>
            <p className="text-gray-500 text-xs tracking-widest uppercase text-center mb-3">Dein Song wird gespielt</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => onPlay(settings?.songSource === "playlist" ? playingSong?.id : undefined)}
              className="text-sm text-white/60 hover:text-white border border-gray-700 hover:border-gray-500 px-5 py-2 rounded-lg transition">
              ▶
            </button>
            {onPause && (
              <button onClick={onPause}
                className="text-sm text-white/60 hover:text-white border border-gray-700 hover:border-gray-500 px-5 py-2 rounded-lg transition">
                <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor"><rect x="0" y="0" width="3" height="12" rx="1"/><rect x="7" y="0" width="3" height="12" rx="1"/></svg>
              </button>
            )}
          </div>
          <div className="flex gap-2 flex-wrap justify-center">
            {onHint && !round.hintRevealed && (settings?.hintsEnabled?.cover ?? true) && (
              <HintButton onClick={onHint} label="Cover" accentColor={accentColor} />
            )}
            {onHintField && !round.hintTitleRevealed && (settings?.hintsEnabled?.title ?? true) && (
              <HintButton onClick={() => onHintField("title")} label="Titel" accentColor={accentColor} />
            )}
            {onHintField && !round.hintArtistRevealed && (settings?.hintsEnabled?.artist ?? true) && (
              <HintButton onClick={() => onHintField("artist")} label="Interpret" accentColor={accentColor} />
            )}
            {onHintField && !round.hintYearRevealed && playingSong.releaseYear && (settings?.hintsEnabled?.year ?? true) && (
              <HintButton onClick={() => onHintField("year")} label="Jahr" accentColor={accentColor} />
            )}
            {(allSkipped || playTimeLeft === 0) && onReveal && (
              <HintButton onClick={onReveal} label="Auflösen" accentColor={accentColor} />
            )}
          </div>
        </div>
        <Scoreboard players={players} displayedScores={displayedScores} popups={popups} currentPlayerId={currentPlayer?.id} myId={myId} skippedPlayers={round.skippedPlayers} wrongPlayers={round.wrongPlayers} guessedSongs={guessedSongs} accentColor={accentColor} currentRound={settings?.gameMode !== "bestOf" ? currentRound : undefined} maxRounds={settings?.gameMode !== "bestOf" ? settings?.maxRounds : undefined} bestOf={settings?.gameMode === "bestOf" ? settings?.bestOf : undefined} />
      </>
    );
  }

  // Picker — picking state: search + local preview
  if (round?.state === "picking" && isMyTurn) {
    return (
      <>
        {lastResult && <ResultBanner result={lastResult} />}

        {lastSongRef.current && (
          <div className="flex flex-col items-center gap-3 opacity-40">
            {lastSongRef.current.albumArt && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={lastSongRef.current.albumArt} alt="" className="w-48 h-48 rounded-xl shadow-2xl" />
            )}
            <div className="text-center">
              <p className="text-white font-bold text-lg">{lastSongRef.current.name}</p>
              <p className="text-gray-400 text-sm">{lastSongRef.current.artist}</p>
              {lastSongRef.current.releaseYear && (
                <p className="text-gray-600 text-sm">{lastSongRef.current.releaseYear}</p>
              )}
            </div>
          </div>
        )}

        <div className="w-full flex flex-col gap-3">
          <div className="border-t" style={{ borderColor: (accentColor ?? "#1DB954") + "40" }} />
          <p className="animate-pulse text-gray-500 text-xs tracking-widest uppercase text-center w-full">Wähle einen Song</p>

          {/* Queue — nur im Spieler-Modus */}
          {settings?.songSource !== "playlist" && queue.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="border-t" style={{ borderColor: (accentColor ?? "#1DB954") + "40" }} />
              <p className="text-xs text-gray-700 uppercase tracking-widest">Warteschlange</p>
              {queue.map((track, i) => (
                <div key={track.id + i} className="flex items-center gap-2 bg-gray-900 rounded-lg px-3 py-2">
                  {track.albumArt && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={track.albumArt} alt="" className="w-8 h-8 rounded shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{track.name}</p>
                    <p className="text-xs text-gray-500 truncate">{track.artist}</p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button onClick={() => moveInQueue(i, -1)} disabled={i === 0}
                      className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-gray-400 disabled:opacity-20 transition text-xs">↑</button>
                    <button onClick={() => moveInQueue(i, 1)} disabled={i === queue.length - 1}
                      className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-gray-400 disabled:opacity-20 transition text-xs">↓</button>
                    {i === 0 && (
                      <button
                        onClick={() => { onSongPick(track); onPlay(track.id); removeFromQueue(0); setLocalSelected(null); onSearchChange(""); }}
                        className="text-xs text-white/70 hover:text-white border border-gray-700 hover:border-gray-500 px-2 py-1 rounded transition ml-1">
                        ▶
                      </button>
                    )}
                    <button onClick={() => removeFromQueue(i)}
                      className="w-6 h-6 flex items-center justify-center text-gray-700 hover:text-gray-400 transition ml-0.5 text-xs">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {settings?.songSource === "playlist" ? (
            <p className="text-gray-700 text-xs text-center">Songs kommen aus der Playlist</p>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text" value={searchQuery} onChange={e => { onSearchChange(e.target.value); setLocalSelected(null); }}
                placeholder="Song suchen…" autoFocus
                className="bg-transparent border-b border-gray-800 focus:border-gray-500 px-2 py-2 text-white placeholder-gray-700 focus:outline-none flex-1 transition-colors"
              />
              <button onClick={pickRandom} disabled={randomLoading}
                className="text-gray-600 hover:text-gray-400 transition disabled:opacity-30 pb-1"
                title="Zufälliger Song">
                {randomLoading ? "…" : "🎲"}
              </button>
            </div>
          )}

          {/* Local preview: selected but not yet submitted — nur im Spieler-Modus */}
          {settings?.songSource !== "playlist" && localSelected && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 w-full px-1">
                {localSelected.albumArt && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={localSelected.albumArt} alt="" className="w-10 h-10 rounded-lg" />
                )}
                <div className="flex-1">
                  <p className="text-white text-sm font-medium">{localSelected.name}</p>
                  <p className="text-gray-500 text-xs">{localSelected.artist}</p>
                  {(localSelected.album || localSelected.releaseYear) && (
                    <p className="text-gray-700 text-xs">{localSelected.album}{localSelected.releaseYear && ` · ${localSelected.releaseYear}`}</p>
                  )}
                </div>
                <button onClick={() => setLocalSelected(null)} className="text-xs text-gray-600 hover:text-gray-400 transition">✕</button>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { onSongPick(localSelected); onPlay(localSelected.id); setLocalSelected(null); onSearchChange(""); }}
                  className="flex-1 text-sm text-white/80 hover:text-white border border-gray-700 hover:border-gray-500 px-4 py-2 rounded-lg transition">
                  ▶ Abspielen
                </button>
                {queue.length < 5 && (
                  <button onClick={() => { addToQueue(localSelected); setLocalSelected(null); onSearchChange(""); }}
                    className="flex-1 text-sm text-gray-500 hover:text-gray-300 border border-gray-800 hover:border-gray-600 px-4 py-2 rounded-lg transition">
                    + Warteschlange
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Search results — nur im Spieler-Modus */}
          {settings?.songSource !== "playlist" && !localSelected && searchResults.length > 0 && (
            <div className="flex flex-col gap-1">
              {searchResults.map(t => (
                <button key={t.id} onClick={() => { setLocalSelected(t); onSearchChange(""); }}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-900 text-left transition">
                  {t.albumArt && <img src={t.albumArt} alt="" className="w-8 h-8 rounded" />}
                  <div>
                    <p className="text-sm text-white">{t.name}</p>
                    <p className="text-xs text-gray-600">{t.artist}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <Scoreboard players={players} displayedScores={displayedScores} popups={popups} currentPlayerId={currentPlayer?.id} myId={myId} skippedPlayers={round?.skippedPlayers} wrongPlayers={round?.wrongPlayers} guessedSongs={guessedSongs} accentColor={accentColor} currentRound={settings?.gameMode !== "bestOf" ? currentRound : undefined} maxRounds={settings?.gameMode !== "bestOf" ? settings?.maxRounds : undefined} bestOf={settings?.gameMode === "bestOf" ? settings?.bestOf : undefined} />
      </>
    );
  }

  // Picker — buzzed state
  if (round?.state === "buzzed" && isMyTurn) {
    return (
      <>
        <p className="text-gray-500 text-xs tracking-widest uppercase text-center w-full">Spiele einen Song</p>
        <div className="flex flex-col items-center gap-4">
          {playingSong && (
            <div className="flex flex-col items-center gap-3">
              {playingSong.albumArt && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={playingSong.albumArt} alt="" className="w-48 h-48 rounded-xl shadow-2xl" />
              )}
              <div className="text-center">
                <p className="text-white font-bold text-lg">{playingSong.name}</p>
                <p className="text-gray-400 text-sm">{playingSong.artist}</p>
                {playingSong.releaseYear && (
                  <p className="text-gray-600 text-sm">{playingSong.releaseYear}</p>
                )}
              </div>
            </div>
          )}
          <div className="w-full border-t" style={{ borderColor: (accentColor ?? "#1DB954") + "40" }} />
          <div className="flex gap-3">
            <button onClick={() => onPlay(settings?.songSource === "playlist" ? playingSong?.id : undefined)}
              className="text-sm text-white/60 hover:text-white border border-gray-700 hover:border-gray-500 px-5 py-2 rounded-lg transition">
              ▶
            </button>
            {onPause && (
              <button onClick={onPause}
                className="text-sm text-white/60 hover:text-white border border-gray-700 hover:border-gray-500 px-5 py-2 rounded-lg transition">
                <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor"><rect x="0" y="0" width="3" height="12" rx="1"/><rect x="7" y="0" width="3" height="12" rx="1"/></svg>
              </button>
            )}
          </div>
          <div className="flex flex-col items-center gap-2">
            <p className="text-gray-400 text-sm">{buzzedPlayer?.name ?? "Jemand"} hat gebuzzert!</p>
            {buzzTimeLeft !== null && (
              <p className={`text-3xl font-light tabular-nums ${buzzTimeLeft <= 5 ? "text-red-400" : "text-gray-400"}`}>
                {buzzTimeLeft}
              </p>
            )}
          </div>
          <div className="flex gap-3 flex-wrap justify-center">
            <button onClick={() => onJudge("correct")}
              className="text-sm text-green-400 hover:text-green-300 border border-green-900 hover:border-green-700 px-4 py-2 rounded-lg transition">
              Richtig
            </button>
            <button onClick={() => onJudge("wrong")}
              className="text-sm text-red-400 hover:text-red-300 border border-red-900 hover:border-red-700 px-4 py-2 rounded-lg transition">
              Falsch
            </button>
          </div>
        </div>
        <Scoreboard players={players} displayedScores={displayedScores} popups={popups} currentPlayerId={currentPlayer?.id} myId={myId} skippedPlayers={round.skippedPlayers} wrongPlayers={round.wrongPlayers} guessedSongs={guessedSongs} accentColor={accentColor} currentRound={settings?.gameMode !== "bestOf" ? currentRound : undefined} maxRounds={settings?.gameMode !== "bestOf" ? settings?.maxRounds : undefined} bestOf={settings?.gameMode === "bestOf" ? settings?.bestOf : undefined} />
      </>
    );
  }

  return null;
}
