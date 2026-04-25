"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { GameLobby } from "@/components/game/GameLobby";
import { RoundView, Scoreboard } from "@/components/game/RoundView";
import { GameData, Track } from "@/components/game/types";
import { extractAccentColor } from "@/lib/accentColor";

interface NowPlaying {
  isPlaying: boolean;
  type?: "track" | "episode";
  title?: string;
  // track
  artist?: string;
  album?: string;
  albumType?: "album" | "single" | "compilation";
  popularity?: number;
  genres?: string[] | null;
  // episode
  showName?: string;
  publisher?: string;
  description?: string;
  // shared
  albumArt?: string;
  songUrl?: string;
  progressMs?: number;
  durationMs?: number;
  releaseYear?: string;
  explicit?: boolean;
}

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}


const albumTypeLabel: Record<string, string> = {
  album: "Album",
  single: "Single",
  compilation: "Compilation",
};

export default function Home() {
  const { data: session, status } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [view, setView] = useState<"now-playing" | "song-quiz">("now-playing");
  const [gameId, setGameId] = useState<string | null>(null);
  const [hostPlayerId, setHostPlayerId] = useState<string | null>(null);
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [hostSearchQuery, setHostSearchQuery] = useState("");
  const [hostSearchResults, setHostSearchResults] = useState<Track[]>([]);

  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [progress, setProgress] = useState(0);
  const [accentColor, setAccentColor] = useState("#1DB954");
  const [gameAccentColor, setGameAccentColor] = useState("#1DB954");
  const progressRef = useRef(0);
  const fetchedAtRef = useRef<number>(0);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/game/my")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setGameId(data.gameId);
          setHostPlayerId(data.playerId);
          setGameData(data.game);
          setView("song-quiz");
        }
      })
      .catch(() => {});
  }, [status]);

  const fetchNowPlaying = useCallback(async () => {
    try {
      const res = await fetch("/api/spotify/now-playing");
      if (!res.ok) return;
      const data = await res.json();
      setNowPlaying(data);
      if (data.progressMs != null) {
        progressRef.current = data.progressMs;
        fetchedAtRef.current = Date.now();
        setProgress(data.progressMs);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!session) return;
    // fetchNowPlaying is async — setState calls never happen synchronously
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNowPlaying();
    const interval = setInterval(fetchNowPlaying, 5000);
    return () => clearInterval(interval);
  }, [session, fetchNowPlaying]);

  useEffect(() => {
    const p = nowPlaying?.albumArt ? extractAccentColor(nowPlaying.albumArt) : Promise.resolve("#1DB954");
    p.then(setAccentColor);
  }, [nowPlaying?.albumArt]);

  useEffect(() => {
    const art = gameData?.round?.albumArt;
    const p = art ? extractAccentColor(art) : Promise.resolve("#1DB954");
    p.then(setGameAccentColor);
  }, [gameData?.round?.albumArt]);


  // Reset progress to 0 on track change so the bar doesn't show stale data
  useEffect(() => {
    progressRef.current = 0;
    fetchedAtRef.current = Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProgress(0);
  }, [gameData?.round?.trackId]);

  useEffect(() => {
    if (!nowPlaying?.isPlaying) return;
    const interval = setInterval(() => {
      setProgress(progressRef.current + (Date.now() - fetchedAtRef.current));
    }, 1000);
    return () => clearInterval(interval);
  }, [nowPlaying?.isPlaying]);

  useEffect(() => {
    if (!gameId) return;
    const interval = setInterval(() => {
      fetch(`/api/game/${gameId}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setGameData(data); });
    }, 1500);
    return () => clearInterval(interval);
  }, [gameId]);


  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!hostSearchQuery.trim() || !gameId || hostSearchQuery.length < 2) { setHostSearchResults([]); return; }
      const res = await fetch(`/api/game/${gameId}/search?q=${encodeURIComponent(hostSearchQuery)}`);
      const data = res.ok ? await res.json() : { tracks: [] };
      setHostSearchResults(data.tracks ?? []);
    }, 400);
    return () => clearTimeout(timer);
  }, [hostSearchQuery, gameId]);

  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-black text-white">
        <p>Laden...</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-black text-white gap-8 p-8">
        <button
          onClick={() => signIn("spotify")}
          className="bg-green-500 hover:bg-green-400 text-black font-semibold px-8 py-3 rounded-full transition"
        >
          Mit Spotify anmelden
        </button>
        <Link
          href="/game"
          className="text-sm text-gray-600 hover:text-gray-400 transition"
        >
          Spiel beitreten
        </Link>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center text-white gap-8 p-8 bg-black overflow-hidden">
      {/* Burger button */}
      <button
        onClick={() => setMenuOpen(true)}
        className="fixed top-4 left-4 z-20 flex flex-col gap-1.5 p-2 text-gray-500 hover:text-gray-300 transition"
        aria-label="Menü öffnen"
      >
        <span className="block w-5 h-px bg-current" />
        <span className="block w-5 h-px bg-current" />
        <span className="block w-5 h-px bg-current" />
      </button>

      {/* Gear / Settings */}
      {gameId && (
        <div className="fixed top-4 right-4 z-20">
          <button
            onClick={() => setSettingsOpen(o => !o)}
            className="p-2 text-gray-500 hover:text-gray-300 transition"
            aria-label="Einstellungen"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
          {settingsOpen && (
            <>
              <div className="fixed inset-0" onClick={() => setSettingsOpen(false)} />
              <div className="absolute right-0 top-10 bg-gray-950 border border-gray-800 rounded-xl p-4 w-64 shadow-xl z-10">
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">Einstellungen</p>
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <span className="text-sm text-gray-300">Pausieren wenn gebuzzert</span>
                  <button
                    role="switch"
                    aria-checked={gameData?.settings?.autoPauseOnBuzz ?? false}
                    onClick={async () => {
                      const next = !(gameData?.settings?.autoPauseOnBuzz ?? false);
                      const res = await fetch(`/api/game/${gameId}/settings`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ autoPauseOnBuzz: next }),
                      });
                      if (res.ok) setGameData(await res.json());
                    }}
                    className={`relative w-10 h-5 rounded-full transition-colors ${(gameData?.settings?.autoPauseOnBuzz ?? false) ? "bg-green-500" : "bg-gray-700"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${(gameData?.settings?.autoPauseOnBuzz ?? false) ? "translate-x-5" : ""}`} />
                  </button>
                </label>
              </div>
            </>
          )}
        </div>
      )}

      {/* Menu overlay */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-30 flex bg-black/95 backdrop-blur-sm"
          onClick={() => setMenuOpen(false)}
        >
          {/* Close button */}
          <button
            onClick={() => setMenuOpen(false)}
            className="fixed top-4 left-4 z-40 flex flex-col gap-1.5 p-2 text-gray-500 hover:text-gray-300 transition"
            aria-label="Menü schließen"
          >
            <span className="block w-5 h-px bg-current rotate-45 translate-y-[7px]" />
            <span className="block w-5 h-px bg-current opacity-0" />
            <span className="block w-5 h-px bg-current -rotate-45 -translate-y-[7px]" />
          </button>

          <nav
            className="flex flex-col justify-start gap-1 w-full px-10 pt-20"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => { setView("now-playing"); setMenuOpen(false); }}
              className="text-left text-2xl font-light text-white/80 hover:text-white py-3 transition"
            >
              Just Playing
            </button>
            <button
              onClick={() => { setView("song-quiz"); setMenuOpen(false); }}
              className="text-left text-2xl font-light text-white/80 hover:text-white py-3 transition"
            >
              Erkennst du den Song?
              {gameId && <span className="ml-2 text-xs text-green-500 font-normal">● aktiv</span>}
            </button>
            {gameId && (
              <button
                onClick={async () => {
                  await fetch(`/api/game/${gameId}`, { method: "DELETE" });
                  setGameId(null); setHostPlayerId(null); setGameData(null); setHostSearchQuery(""); setHostSearchResults([]);
                  setMenuOpen(false);
                }}
                className="text-left text-sm font-light text-gray-700 hover:text-gray-500 py-1 pl-1 transition"
              >
                Spiel beenden
              </button>
            )}
            <div className="w-8 h-px bg-gray-800 my-2" />
            <button
              onClick={() => signOut()}
              className="text-left text-sm font-light text-gray-600 hover:text-gray-400 py-2 transition"
            >
              Abmelden
            </button>
          </nav>
        </div>
      )}
      {nowPlaying?.albumArt && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={nowPlaying.albumArt}
            alt=""
            aria-hidden
            className="absolute inset-0 w-full h-full object-cover scale-110"
            style={{ filter: "blur(40px) brightness(0.35) saturate(1.4)" }}
          />
          <div className="absolute inset-0 bg-black/40" />
        </>
      )}
      <div className="relative z-10 flex flex-col items-center gap-8 w-full">
      {view === "song-quiz" ? (
        <div className="flex flex-col items-center gap-5 w-full max-w-sm">
          {!gameId ? (
            <button onClick={async () => {
                const res = await fetch("/api/game/create", { method: "POST" });
                const data = await res.json();
                setHostPlayerId(data.playerId ?? null);
                setGameId(data.id);
                setGameData(data.game ?? null);
              }}
              className="text-left text-2xl font-light text-white/80 hover:text-white py-3 transition"
            >
              Spiel erstellen
            </button>
          ) : !gameData || gameData.status === "lobby" ? (
            <GameLobby
              players={gameData?.players ?? []}
              myId={hostPlayerId ?? ""}
              gameId={gameId}
              settings={gameData?.settings}
              playlistTrackCount={gameData?.playlistTrackCount}
              onGameData={setGameData}
              onStart={async () => {
                const res = await fetch(`/api/game/${gameId}/start`, { method: "POST" });
                if (res.ok) setGameData(await res.json());
              }}
            />
          ) : gameData.status === "finished" ? (
            <div className="flex flex-col items-center gap-4 w-full max-w-xs">
              <Scoreboard
                players={gameData.players}
                displayedScores={gameData.scores}
                myId={hostPlayerId ?? ""}
                guessedSongs={gameData.guessedSongs}
                accentColor={gameAccentColor}
                expandAll
                currentRound={gameData.currentRound}
                maxRounds={gameData.settings?.gameMode !== "bestOf" ? gameData.settings?.maxRounds : undefined}
                bestOf={gameData.settings?.gameMode === "bestOf" ? gameData.settings?.bestOf : undefined}
              />
              <button
                onClick={async () => {
                  const res = await fetch(`/api/game/${gameId}/reset`, { method: "POST" });
                  if (res.ok) setGameData(await res.json());
                }}
                className="text-sm font-light text-white/80 hover:text-white border border-gray-800 hover:border-gray-600 px-4 py-2 rounded-lg transition"
              >
                Neues Spiel
              </button>
            </div>
          ) : (
            <RoundView
              gameId={gameId}
              myId={hostPlayerId ?? ""}
              players={gameData.players}
              currentPlayerIndex={gameData.currentPlayerIndex}
              scores={gameData.scores}
              guessedSongs={gameData.guessedSongs}
              round={gameData.round}
              lastResult={gameData.lastResult}
              accentColor={gameAccentColor}
              settings={gameData.settings}
              currentRound={gameData.currentRound}
              playbackMs={nowPlaying?.durationMs ? { current: progress, duration: nowPlaying.durationMs, isPlaying: nowPlaying.isPlaying } : undefined}
              searchQuery={hostSearchQuery}
              onSearchChange={setHostSearchQuery}
              searchResults={hostSearchResults}
              onSongPick={async (t) => {
                const res = await fetch(`/api/game/${gameId}/song`, {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ playerId: hostPlayerId, trackId: t.id, songName: t.name, artistName: t.artist, albumArt: t.albumArt, previewUrl: t.previewUrl, albumName: t.album, releaseYear: t.releaseYear }),
                });
                if (res.ok) setGameData(await res.json());
              }}
              onPlay={async (trackId) => { await fetch(`/api/game/${gameId}/play`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackId }) }); setTimeout(fetchNowPlaying, 800); }}
              onPause={async () => { await fetch(`/api/game/${gameId}/pause`, { method: "POST" }); fetchNowPlaying(); }}
              onBuzz={() => fetch(`/api/game/${gameId}/buzz`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerId: hostPlayerId }) })}
              onSkip={() => fetch(`/api/game/${gameId}/skip`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerId: hostPlayerId }) })}
              onReveal={async () => { const res = await fetch(`/api/game/${gameId}/judge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "skip" }) }); if (res.ok) setGameData(await res.json()); }}
              onHint={async () => { const res = await fetch(`/api/game/${gameId}/hint`, { method: "POST" }); if (res.ok) setGameData(await res.json()); }}
              onHintField={async (field) => { const res = await fetch(`/api/game/${gameId}/hint`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: field }) }); if (res.ok) setGameData(await res.json()); }}
              onJudge={async (action) => {
                const res = await fetch(`/api/game/${gameId}/judge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
                if (res.ok) setGameData(await res.json());
              }}
            />
          )}
        </div>
      ) : nowPlaying?.isPlaying ? (
        <div className="flex flex-col items-center gap-5 w-full max-w-sm">
          {nowPlaying.albumArt && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={nowPlaying.albumArt}
              alt={nowPlaying.type === "episode" ? nowPlaying.showName : nowPlaying.album}
              className="w-64 h-64 rounded-xl shadow-2xl"
            />
          )}

          <div className="text-center w-full">
            <div className="flex items-center justify-center gap-2">
              <span className="text-xl font-bold">{nowPlaying.title}</span>
              {nowPlaying.explicit && (
                <span className="text-xs bg-gray-600 text-gray-300 px-1.5 py-0.5 rounded font-bold shrink-0">
                  E
                </span>
              )}
              {nowPlaying.songUrl && (
                <a href={nowPlaying.songUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[#1DB954] hover:text-[#1ed760] transition">
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                  </svg>
                </a>
              )}
              {nowPlaying.title && (nowPlaying.artist || nowPlaying.showName) && (
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(`${nowPlaying.title} ${nowPlaying.artist ?? nowPlaying.showName}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-gray-500 hover:text-gray-300 transition"
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                </a>
              )}
            </div>

            {nowPlaying.type === "episode" ? (
              <>
                <p className="text-gray-400 font-medium">{nowPlaying.showName}</p>
                <p className="text-gray-600 text-sm">
                  {nowPlaying.publisher}
                  {nowPlaying.releaseYear && ` · ${nowPlaying.releaseYear}`}
                </p>
                {nowPlaying.description && (
                  <p className="text-gray-700 text-xs mt-2 line-clamp-3 text-left">{nowPlaying.description}</p>
                )}
              </>
            ) : (
              <>
                <p className="text-gray-400">{nowPlaying.artist}</p>
                <p className="text-gray-600 text-sm">
                  {nowPlaying.album}
                  {nowPlaying.releaseYear && ` · ${nowPlaying.releaseYear}`}
                  {nowPlaying.albumType && ` · ${albumTypeLabel[nowPlaying.albumType] ?? nowPlaying.albumType}`}
                </p>
              </>
            )}
          </div>

          {nowPlaying.durationMs != null && (
            <div className="w-full">
              <div className="w-full bg-gray-800 rounded-full h-1">
                <div
                  className="rounded-full h-1 transition-[width] duration-1000"
                  style={{ width: `${Math.min((progress / nowPlaying.durationMs) * 100, 100)}%`, backgroundColor: accentColor }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-600 mt-1">
                <span>{formatTime(Math.min(progress, nowPlaying.durationMs))}</span>
                <span>{formatTime(nowPlaying.durationMs)}</span>
              </div>
            </div>
          )}

          {nowPlaying.type === "track" && (
            <>
              {nowPlaying.popularity != null && (
                <div className="w-full bg-gray-900 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-2">Popularität</p>
                  <div className="w-full bg-gray-800 rounded-full h-1 mb-1">
                    <div
                      className="rounded-full h-1"
                      style={{ width: `${nowPlaying.popularity}%`, backgroundColor: accentColor }}
                    />
                  </div>
                  <p className="text-xs text-gray-600 text-right">{nowPlaying.popularity} / 100</p>
                </div>
              )}

              {nowPlaying.genres && nowPlaying.genres.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-center">
                  {nowPlaying.genres.map((genre) => (
                    <span key={genre} className="text-xs bg-gray-900 px-3 py-1 rounded-full" style={{ color: accentColor }}>
                      {genre}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}

</div>
      ) : (
        <p className="text-gray-500">Gerade läuft nichts.</p>
      )}

      </div>
    </main>
  );
}
