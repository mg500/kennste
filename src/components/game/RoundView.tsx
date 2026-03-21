"use client";

import { useState, useEffect, useRef } from "react";
import { Player, Round, Track, GuessedSong } from "./types";

interface Props {
  gameId: string;
  myId: string;
  players: Player[];
  currentPlayerIndex: number;
  scores: Record<string, number>;
  guessedSongs?: Record<string, GuessedSong[]>;
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
  onJudge: (action: "correct" | "wrong") => void;
}

const ANIM_MS = 1200;

function Scoreboard({ players, scores, currentPlayerId, myId, skippedPlayers = [], wrongPlayers = [], guessedSongs = {} }: {
  players: Player[]; scores: Record<string, number>; currentPlayerId?: string; myId: string;
  skippedPlayers?: string[]; wrongPlayers?: string[]; guessedSongs?: Record<string, GuessedSong[]>;
}) {
  const [displayedScores, setDisplayedScores] = useState<Record<string, number>>(scores);
  const [popups, setPopups] = useState<{ id: string; delta: number; key: number }[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const keyRef = useRef(0);
  const animatingRef = useRef(false);

  useEffect(() => {
    if (animatingRef.current) return;
    const newPopups: { id: string; delta: number; key: number }[] = [];
    for (const p of players) {
      const prev = displayedScores[p.id] ?? 0;
      const curr = scores[p.id] ?? 0;
      if (curr > prev) newPopups.push({ id: p.id, delta: curr - prev, key: keyRef.current++ });
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

  const sorted = [...players].sort((a, b) => (displayedScores[b.id] ?? 0) - (displayedScores[a.id] ?? 0));
  return (
    <div className="w-full flex flex-col gap-1">
      {sorted.map(p => {
        const songs = guessedSongs[p.id] ?? [];
        const isExpanded = expandedId === p.id;
        return (
          <div key={p.id}>
            <button
              onClick={() => setExpandedId(isExpanded ? null : p.id)}
              className={`relative flex justify-between items-center px-3 py-2 rounded-lg text-sm w-full text-left ${p.id === myId ? "bg-gray-900" : ""}`}
            >
              <span className={`flex items-center gap-2 ${p.id === currentPlayerId ? "text-white" : "text-gray-500"}`}>
                {p.id === currentPlayerId && <span className="text-green-500 text-xs leading-none">▶</span>}
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
  );
}

export function RoundView({
  gameId, myId, players, currentPlayerIndex, scores, guessedSongs = {}, round,
  searchQuery, onSearchChange, searchResults, onSongPick,
  onPlay, onPause, onBuzz, onSkip, onReveal, onJudge,
}: Props) {
  const [localSelected, setLocalSelected] = useState<Track | null>(null);
  const [randomLoading, setRandomLoading] = useState(false);

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
  const lastSongRef = useRef<{ name: string; artist: string; albumArt: string | null } | null>(null);

  useEffect(() => {
    if (round?.trackId && round.songName) {
      lastSongRef.current = { name: round.songName, artist: round.artistName ?? "", albumArt: round.albumArt ?? null };
    }
  }, [round?.trackId, round?.songName, round?.artistName, round?.albumArt]);

  const currentPlayer = players[currentPlayerIndex];
  const isMyTurn = currentPlayer?.id === myId;
  const buzzedPlayer = round?.buzzedBy ? players.find(p => p.id === round.buzzedBy) : null;
  const alreadyBuzzed = round?.buzzedPlayers.includes(myId) ?? false;
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
        <p className="text-gray-600 text-xs tracking-widest uppercase">
          {round?.state === "picking" ? `${currentPlayer?.name} wählt einen Song` : "Errate den Song!"}
        </p>

        {round?.state === "picking" && lastSongRef.current && (
          <div className="flex flex-col items-center gap-3 opacity-40">
            {lastSongRef.current.albumArt && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={lastSongRef.current.albumArt} alt="" className="w-32 h-32 rounded-xl" />
            )}
            <div className="text-center">
              <p className="text-white text-sm font-medium">{lastSongRef.current.name}</p>
              <p className="text-gray-400 text-xs">{lastSongRef.current.artist}</p>
            </div>
          </div>
        )}

        {round?.state === "playing" && (
          <div className="flex flex-col items-center gap-4 w-full">
            {playingSong && (
              <div className="flex flex-col items-center gap-3" style={{ filter: "blur(12px)", userSelect: "none", pointerEvents: "none" }}>
                {playingSong.albumArt && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={playingSong.albumArt} alt="" className="w-32 h-32 rounded-xl" />
                )}
                <div className="text-center">
                  <p className="text-white text-sm font-medium">{playingSong.name}</p>
                  <p className="text-gray-400 text-xs">{playingSong.artist}</p>
                  {(playingSong.album || playingSong.releaseYear) && (
                    <p className="text-gray-600 text-xs">{playingSong.album}{playingSong.releaseYear && ` · ${playingSong.releaseYear}`}</p>
                  )}
                </div>
              </div>
            )}
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
            <p className="text-gray-700 text-xs">Warte auf Auflösung…</p>
          </div>
        )}
        <Scoreboard players={players} scores={scores} currentPlayerId={currentPlayer?.id} myId={myId} skippedPlayers={round?.skippedPlayers} wrongPlayers={round?.wrongPlayers} guessedSongs={guessedSongs} />
      </>
    );
  }

  // Picker — playing state: Just Playing-like view
  if (round?.state === "playing" && isMyTurn && playingSong) {
    return (
      <>
        <p className="text-gray-600 text-xs tracking-widest uppercase">Spiele einen Song</p>

        <div className="w-full flex flex-col items-center gap-4">
          {playingSong.albumArt && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={playingSong.albumArt} alt="" className="w-48 h-48 rounded-xl shadow-2xl" />
          )}
          <div className="text-center">
            <p className="text-white font-bold text-lg">{playingSong.name}</p>
            <p className="text-gray-400 text-sm">{playingSong.artist}</p>
            {(playingSong.album || playingSong.releaseYear) && (
              <p className="text-gray-600 text-sm">
                {playingSong.album}{playingSong.releaseYear && ` · ${playingSong.releaseYear}`}
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={() => onPlay(undefined)}
              className="text-sm text-white/60 hover:text-white border border-gray-700 hover:border-gray-500 px-5 py-2 rounded-lg transition">
              ▶
            </button>
            {onPause && (
              <button onClick={onPause}
                className="text-sm text-white/60 hover:text-white border border-gray-700 hover:border-gray-500 px-5 py-2 rounded-lg transition">
                ⏸
              </button>
            )}
          </div>
          {allSkipped && onReveal && (
            <button onClick={onReveal}
              className="text-sm text-white/60 hover:text-white border border-gray-700 hover:border-gray-500 px-4 py-2 rounded-lg transition">
              Auflösen
            </button>
          )}
        </div>
        <Scoreboard players={players} scores={scores} currentPlayerId={currentPlayer?.id} myId={myId} skippedPlayers={round.skippedPlayers} wrongPlayers={round.wrongPlayers} guessedSongs={guessedSongs} />
      </>
    );
  }

  // Picker — picking state: search + local preview
  if (round?.state === "picking" && isMyTurn) {
    return (
      <>
        <p className="text-gray-600 text-xs tracking-widest uppercase">Spiele einen Song</p>

        {lastSongRef.current && (
          <div className="flex flex-col items-center gap-2 opacity-40">
            {lastSongRef.current.albumArt && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={lastSongRef.current.albumArt} alt="" className="w-24 h-24 rounded-xl" />
            )}
            <div className="text-center">
              <p className="text-white text-sm font-medium">{lastSongRef.current.name}</p>
              <p className="text-gray-400 text-xs">{lastSongRef.current.artist}</p>
            </div>
          </div>
        )}

        <div className="w-full flex flex-col gap-3">
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

          {/* Local preview: selected but not yet submitted */}
          {localSelected && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 w-full px-1">
                {localSelected.albumArt && <img src={localSelected.albumArt} alt="" className="w-10 h-10 rounded-lg" />}
                <div className="flex-1">
                  <p className="text-white text-sm font-medium">{localSelected.name}</p>
                  <p className="text-gray-500 text-xs">{localSelected.artist}</p>
                </div>
                <button onClick={() => setLocalSelected(null)} className="text-xs text-gray-600 hover:text-gray-400 transition">✕</button>
              </div>
              <button onClick={() => { onSongPick(localSelected); onPlay(localSelected.id); }}
                className="w-full text-sm text-white/80 hover:text-white border border-gray-700 hover:border-gray-500 px-4 py-2 rounded-lg transition">
                ▶ Abspielen
              </button>
            </div>
          )}

          {/* Search results (only when no local selection) */}
          {!localSelected && searchResults.length > 0 && (
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
        <Scoreboard players={players} scores={scores} currentPlayerId={currentPlayer?.id} myId={myId} skippedPlayers={round?.skippedPlayers} wrongPlayers={round?.wrongPlayers} guessedSongs={guessedSongs} />
      </>
    );
  }

  // Picker — buzzed state
  if (round?.state === "buzzed" && isMyTurn) {
    return (
      <>
        <p className="text-gray-600 text-xs tracking-widest uppercase">Spiele einen Song</p>
        <div className="flex flex-col items-center gap-4">
          {playingSong && (
            <div className="flex flex-col items-center gap-3">
              {playingSong.albumArt && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={playingSong.albumArt} alt="" className="w-32 h-32 rounded-xl shadow-xl" />
              )}
              <div className="text-center">
                <p className="text-white font-bold">{playingSong.name}</p>
                <p className="text-gray-400 text-sm">{playingSong.artist}</p>
                {(playingSong.album || playingSong.releaseYear) && (
                  <p className="text-gray-600 text-sm">
                    {playingSong.album}{playingSong.releaseYear && ` · ${playingSong.releaseYear}`}
                  </p>
                )}
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={() => onPlay(undefined)}
              className="text-sm text-white/60 hover:text-white border border-gray-700 hover:border-gray-500 px-5 py-2 rounded-lg transition">
              ▶
            </button>
            {onPause && (
              <button onClick={onPause}
                className="text-sm text-white/60 hover:text-white border border-gray-700 hover:border-gray-500 px-5 py-2 rounded-lg transition">
                ⏸
              </button>
            )}
          </div>
          <p className="text-gray-400 text-sm">{buzzedPlayer?.name ?? "Jemand"} hat gebuzzert!</p>
          <div className="flex gap-3">
            <button onClick={() => onJudge("correct")}
              className="text-sm text-green-400 hover:text-green-300 border border-green-900 hover:border-green-700 px-4 py-2 rounded-lg transition">
              Richtig ✓
            </button>
            <button onClick={() => onJudge("wrong")}
              className="text-sm text-red-400 hover:text-red-300 border border-red-900 hover:border-red-700 px-4 py-2 rounded-lg transition">
              Falsch ✗
            </button>
          </div>
        </div>
        <Scoreboard players={players} scores={scores} currentPlayerId={currentPlayer?.id} myId={myId} skippedPlayers={round.skippedPlayers} wrongPlayers={round.wrongPlayers} guessedSongs={guessedSongs} />
      </>
    );
  }

  return null;
}
