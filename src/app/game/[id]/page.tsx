"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { GameLobby } from "@/components/game/GameLobby";
import { RoundView, Scoreboard } from "@/components/game/RoundView";
import { gameApi, loadCredentials, saveCredentials, type Credentials } from "@/lib/game/client";
import type { Game } from "@/lib/game/types";
import { extractAccentColor } from "@/lib/accentColor";

export default function GamePage() {
  const { id } = useParams<{ id: string }>();
  const [game, setGame] = useState<Game | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [started, setStarted] = useState(false);
  const [kicked, setKicked] = useState(false);
  const [name, setName] = useState("");
  const [creds, setCreds] = useState<Credentials | null>(null);
  const playerId = creds?.playerId ?? null;
  const api = useMemo(() => (creds ? gameApi(id, creds.token) : null), [id, creds]);
  const [joining, setJoining] = useState(false);
  const [accentColor, setAccentColor] = useState("#1DB954");
  const [playbackMs, setPlaybackMs] = useState<{ current: number; duration: number; isPlaying: boolean } | undefined>();
  const playbackRef = useRef<{ progressMs: number; fetchedAt: number; isPlaying: boolean; durationMs: number } | null>(null);
  const pollPlaybackRef = useRef<() => void>(() => {});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastPreviewRef = useRef<string | null>(null);

  // Initial game check + restore session from sessionStorage
  useEffect(() => {
    fetch(`/api/game/${id}`)
      .then(r => (r.ok ? r.json() : null))
      .then((data: Game | null) => {
        if (!data) { setNotFound(true); return; }
        setGame(data);
        const saved = loadCredentials(id);
        if (!saved) return;
        const known = [...data.players, ...(data.viewerPlayers ?? [])].some(p => p.id === saved.playerId);
        if (known) setCreds(saved);
        else saveCredentials(id, null);
      });
  }, [id]);

  // Polling after join
  useEffect(() => {
    if (!playerId) return;
    const interval = setInterval(() => {
      fetch(`/api/game/${id}`)
        .then(r => (r.ok ? r.json() : null))
        .then((data: Game | null) => {
          if (!data) { setNotFound(true); return; }
          const inPlayers = data.players.some(p => p.id === playerId);
          const inViewers = data.viewerPlayers?.some(p => p.id === playerId);
          if (data.status === "lobby" && !inPlayers && !inViewers) {
            saveCredentials(id, null);
            setKicked(true); setCreds(null);
          } else {
            setGame(data);
          }
        });
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

  // Poll Spotify playback state — reset on track change so old data is never shown
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!api || game?.round?.state !== "playing") { setPlaybackMs(undefined); playbackRef.current = null; return; }
    playbackRef.current = null;
    setPlaybackMs(undefined);
    let cancelled = false;
    const poll = async () => {
      const data = await api.playback();
      if (!data || cancelled) return;
      playbackRef.current = { progressMs: data.progressMs, fetchedAt: Date.now(), isPlaying: data.isPlaying, durationMs: data.durationMs };
    };
    pollPlaybackRef.current = poll;
    void poll();
    const pollId = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(pollId); };
  }, [api, game?.round?.state, game?.round?.trackId]);

  // Interpolate playback progress
  useEffect(() => {
    if (!playerId || game?.round?.state !== "playing") return;
    const tick = () => {
      const p = playbackRef.current;
      if (!p || !p.durationMs) return;
      const current = p.isPlaying ? p.progressMs + (Date.now() - p.fetchedAt) : p.progressMs;
      setPlaybackMs({ current, duration: p.durationMs, isPlaying: p.isPlaying });
    };
    tick();
    const id2 = setInterval(tick, 1000);
    return () => clearInterval(id2);
  }, [playerId, game?.round?.state, game?.round?.trackId]);

  // Accent color from album art
  useEffect(() => {
    const art = game?.round?.albumArt;
    const p = art ? extractAccentColor(art) : Promise.resolve("#1DB954");
    p.then(setAccentColor);
  }, [game?.round?.albumArt]);

  const join = async () => {
    if (!name.trim() || joining) return;
    setJoining(true);
    const res = await fetch(`/api/game/${id}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const data = await res.json();
    if (res.ok) {
      const next = { playerId: data.playerId, token: data.token };
      saveCredentials(id, next);
      setCreds(next);
      setGame(data.game);
    }
    else if (res.status === 403) setStarted(true);
    setJoining(false);
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

  if (kicked) return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-black text-white gap-6 p-8">
      <p className="text-gray-500 text-sm">Du wurdest aus der Lobby entfernt.</p>
      <button
        onClick={() => setKicked(false)}
        className="text-sm text-gray-600 hover:text-gray-400 transition"
      >
        Erneut beitreten
      </button>
    </main>
  );

  if (!game) return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white">
      <p className="text-gray-700">Laden…</p>
    </main>
  );

  // Name entry
  if (!playerId || !api) return (
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

  const albumArt = game.round?.albumArt;

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
        <GameLobby api={api} game={game} myId={playerId} onGameData={setGame} />
      ) : game.status === "finished" ? (
        <div className="relative z-10 flex flex-col items-center gap-4 w-full max-w-xs">
          <Scoreboard
            players={game.players}
            displayedScores={game.scores}
            myId={playerId}
            guessedSongs={game.guessedSongs}
            accentColor={accentColor}
            expandAll
            currentRound={game.currentRound}
            maxRounds={game.settings?.gameMode !== "bestOf" ? game.settings?.maxRounds : undefined}
            bestOf={game.settings?.gameMode === "bestOf" ? game.settings?.bestOf : undefined}
          />
        </div>
      ) : (
        <div className="relative z-10 w-full max-w-xs flex flex-col gap-5">
          <RoundView
            api={api}
            game={game}
            myId={playerId}
            onGameData={setGame}
            onPlaybackChange={() => pollPlaybackRef.current()}
            accentColor={accentColor}
            playbackMs={playbackMs}
          />
        </div>
      )}
    </main>
  );
}
