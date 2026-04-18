"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { GameLobby } from "@/components/game/GameLobby";
import { RoundView, Scoreboard } from "@/components/game/RoundView";
import { GameData, Track } from "@/components/game/types";
import { extractAccentColor } from "@/lib/accentColor";

export default function GamePage() {
  const { id } = useParams<{ id: string }>();
  const [game, setGame] = useState<GameData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [started, setStarted] = useState(false);
  const [name, setName] = useState("");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [accentColor, setAccentColor] = useState("#1DB954");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastPreviewRef = useRef<string | null>(null);

  // Initial game check
  useEffect(() => {
    fetch(`/api/game/${id}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (!data) setNotFound(true); else setGame(data); });
  }, [id]);

  // Polling after join
  useEffect(() => {
    if (!playerId) return;
    const interval = setInterval(() => {
      fetch(`/api/game/${id}`)
        .then(r => (r.ok ? r.json() : null))
        .then(data => { if (data) setGame(data); else setNotFound(true); });
    }, 1500);
    return () => clearInterval(interval);
  }, [playerId, id]);

  // Audio control
  useEffect(() => {
    if (!game || !playerId) return;
    const isMyTurn = game.players[game.currentPlayerIndex]?.id === playerId;
    const round = game.round;

    if (!round || isMyTurn || round.state !== "playing" || !round.previewUrl) {
      audioRef.current?.pause();
      return;
    }

    if (round.previewUrl !== lastPreviewRef.current) {
      audioRef.current?.pause();
      audioRef.current = new Audio(round.previewUrl);
      audioRef.current.loop = true;
      lastPreviewRef.current = round.previewUrl;
    }
    audioRef.current?.play().catch(() => {});
  }, [game?.round?.state, game?.round?.previewUrl, game?.currentPlayerIndex, playerId]);

  // Pause on unmount
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  // Accent color from album art
  useEffect(() => {
    const art = game?.round?.albumArt;
    const p = art ? extractAccentColor(art) : Promise.resolve("#1DB954");
    p.then(setAccentColor);
  }, [game?.round?.albumArt]);

  // Song search debounce
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!searchQuery.trim() || searchQuery.length < 2) { setSearchResults([]); return; }
      const res = await fetch(`/api/game/${id}/search?q=${encodeURIComponent(searchQuery)}`);
      const data = res.ok ? await res.json() : { tracks: [] };
      setSearchResults(data.tracks ?? []);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery, id]);

  const join = async () => {
    if (!name.trim() || joining) return;
    setJoining(true);
    const res = await fetch(`/api/game/${id}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const data = await res.json();
    if (res.ok) { setPlayerId(data.playerId); setGame(data.game); }
    else if (res.status === 403) setStarted(true);
    setJoining(false);
  };

  const submitSong = async (track: Track) => {
    const res = await fetch(`/api/game/${id}/song`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId, trackId: track.id, songName: track.name, artistName: track.artist,
        albumArt: track.albumArt, previewUrl: track.previewUrl, albumName: track.album, releaseYear: track.releaseYear,
      }),
    });
    if (res.ok) setGame(await res.json());
    setSearchQuery(""); setSearchResults([]);
  };

  const doBuzz = async () => {
    audioRef.current?.pause();
    await fetch(`/api/game/${id}/buzz`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
    });
  };

  const doJudge = async (action: "correct" | "wrong") => {
    const res = await fetch(`/api/game/${id}/judge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) setGame(await res.json());
  };

  if (notFound) return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white">
      <p className="text-gray-500">Das Spiel wurde beendet.</p>
    </main>
  );

  if (started) return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white">
      <p className="text-gray-500">Das Spiel hat bereits begonnen.</p>
    </main>
  );

  if (!game) return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white">
      <p className="text-gray-700">Laden…</p>
    </main>
  );

  // Name entry
  if (!playerId) return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-black text-white gap-6 p-8">
      <p className="text-gray-600 text-xs tracking-widest uppercase">Erkennst du den Song?</p>
      <input
        type="text" value={name} onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === "Enter" && join()} placeholder="Dein Name"
        maxLength={20} autoFocus
        className="bg-transparent border-b border-gray-800 focus:border-gray-500 px-2 py-2 text-white placeholder-gray-700 focus:outline-none w-full max-w-xs text-center transition-colors"
      />
      <button onClick={join} disabled={joining || !name.trim()}
        className="text-sm text-gray-600 hover:text-gray-400 transition disabled:opacity-30">
        Beitreten
      </button>
    </main>
  );

  const round = game.round;

  const albumArt = round?.albumArt;

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center bg-black text-white gap-6 p-8 overflow-hidden">
      {albumArt && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={albumArt}
            alt=""
            aria-hidden
            className="absolute inset-0 w-full h-full object-cover scale-110"
            style={{ filter: "blur(40px) brightness(0.35) saturate(1.4)" }}
          />
          <div className="absolute inset-0 bg-black/40" />
        </>
      )}
      {game.status === "lobby" ? (
        <GameLobby players={game.players} myId={playerId} gameId={game.id} settings={game.settings} onGameData={setGame} />
      ) : game.status === "finished" ? (
        <div className="relative z-10 flex flex-col items-center gap-4 w-full max-w-xs">
          <Scoreboard
            players={game.players}
            displayedScores={game.scores}
            myId={playerId}
            guessedSongs={game.guessedSongs}
            accentColor={accentColor}
            expandAll
          />
        </div>
      ) : (
        <div className="relative z-10 w-full max-w-xs flex flex-col gap-5">
          <RoundView
            gameId={game.id}
            myId={playerId}
            players={game.players}
            currentPlayerIndex={game.currentPlayerIndex}
            scores={game.scores}
            guessedSongs={game.guessedSongs}
            round={round}
            lastResult={game.lastResult}
            accentColor={accentColor}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchResults={searchResults}
            onSongPick={submitSong}
            onPlay={trackId => fetch(`/api/game/${game.id}/play`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackId }) })}
            onPause={() => fetch(`/api/game/${game.id}/pause`, { method: "POST" })}
            onBuzz={doBuzz}
            onSkip={() => fetch(`/api/game/${game.id}/skip`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerId }) })}
          onReveal={async () => { const res = await fetch(`/api/game/${game.id}/judge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "skip" }) }); if (res.ok) setGame(await res.json()); }}
            onHint={async () => { const res = await fetch(`/api/game/${game.id}/hint`, { method: "POST" }); if (res.ok) setGame(await res.json()); }}
            onHintField={async (field) => { const res = await fetch(`/api/game/${game.id}/hint`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: field }) }); if (res.ok) setGame(await res.json()); }}
            onJudge={doJudge}
          />
        </div>
      )}
    </main>
  );
}
