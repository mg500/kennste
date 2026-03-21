"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

interface Player { id: string; name: string; }
interface Round {
  state: "picking" | "playing" | "buzzed";
  songName?: string; artistName?: string; albumArt?: string;
  previewUrl?: string | null; buzzedBy?: string;
}
interface GameData {
  id: string; players: Player[]; status: "lobby" | "playing";
  hostPlayerId: string; currentPlayerIndex: number;
  scores: Record<string, number>; round?: Round;
}
interface Track {
  id: string; name: string; artist: string;
  albumArt: string | null; previewUrl: string;
}

function Scoreboard({ game, myId }: { game: GameData; myId: string }) {
  const sorted = [...game.players].sort((a, b) => (game.scores[b.id] ?? 0) - (game.scores[a.id] ?? 0));
  const currentId = game.players[game.currentPlayerIndex]?.id;
  return (
    <div className="w-full flex flex-col gap-1">
      {sorted.map(p => (
        <div key={p.id} className={`flex justify-between items-center px-3 py-2 rounded-lg text-sm ${p.id === myId ? "bg-gray-900" : ""}`}>
          <span className={`${p.id === currentId ? "text-white" : "text-gray-500"} flex items-center gap-2`}>
            {p.id === currentId && <span className="w-1.5 h-1.5 rounded-full bg-white inline-block" />}
            {p.name}
            {p.id === myId && <span className="text-gray-700 text-xs">du</span>}
          </span>
          <span className="text-gray-400 tabular-nums">{game.scores[p.id] ?? 0}</span>
        </div>
      ))}
    </div>
  );
}

export default function GamePage() {
  const { id } = useParams<{ id: string }>();
  const [game, setGame] = useState<GameData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState("");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Track[]>([]);
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
        .then(data => { if (data) setGame(data); });
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

  // Song search debounce
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
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
    setJoining(false);
  };

  const submitSong = async (track: Track) => {
    const res = await fetch(`/api/game/${id}/song`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId, trackId: track.id, songName: track.name, artistName: track.artist,
        albumArt: track.albumArt, previewUrl: track.previewUrl,
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

  if (notFound) return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white">
      <p className="text-gray-500">Spiel nicht gefunden.</p>
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

  // Lobby
  if (game.status === "lobby") return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-black text-white gap-6 p-8">
      <p className="text-gray-600 text-xs tracking-widest uppercase">Lobby</p>
      <div className="flex flex-col gap-1 w-full max-w-xs">
        {game.players.map(p => (
          <div key={p.id} className={`text-sm py-2 px-3 rounded-lg flex justify-between ${p.id === playerId ? "bg-gray-900" : ""}`}>
            <span className={p.id === playerId ? "text-white" : "text-gray-500"}>{p.name}</span>
            {p.id === playerId && <span className="text-gray-700 text-xs">du</span>}
          </div>
        ))}
      </div>
      <p className="text-gray-800 text-xs">Warte auf den Spielleiter…</p>
    </main>
  );

  // Game playing
  const currentPlayer = game.players[game.currentPlayerIndex];
  const isMyTurn = currentPlayer?.id === playerId;
  const round = game.round;
  const buzzedPlayer = round?.buzzedBy ? game.players.find(p => p.id === round.buzzedBy) : null;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-black text-white gap-6 p-8">
      <Scoreboard game={game} myId={playerId} />

      {round?.state === "picking" && isMyTurn && (
        <div className="w-full max-w-xs flex flex-col gap-3">
          <p className="text-xs text-gray-600 text-center">Dein Song</p>
          <input
            type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Song suchen…" autoFocus
            className="bg-transparent border-b border-gray-800 focus:border-gray-500 px-2 py-2 text-white placeholder-gray-700 focus:outline-none w-full transition-colors"
          />
          {searchResults.length > 0 && (
            <div className="flex flex-col gap-1">
              {searchResults.map(t => (
                <button key={t.id} onClick={() => submitSong(t)}
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

      {round?.state === "picking" && !isMyTurn && (
        <p className="text-gray-700 text-sm">
          {currentPlayer?.name} wählt einen Song…
        </p>
      )}

      {round?.state === "playing" && !isMyTurn && (
        <div className="flex flex-col items-center gap-6">
          <p className="text-gray-500 text-sm">Errate den Song!</p>
          <button onClick={doBuzz}
            className="w-36 h-36 rounded-full border border-white/20 hover:border-white/60 text-white text-xl font-light transition active:scale-95">
            Buzz
          </button>
        </div>
      )}

      {round?.state === "playing" && isMyTurn && (
        <p className="text-gray-700 text-sm">Song spielt…</p>
      )}

      {round?.state === "buzzed" && (
        <div className="flex flex-col items-center gap-2 text-center">
          {round.buzzedBy === playerId
            ? <p className="text-white">Du hast gebuzzert!</p>
            : <p className="text-gray-400">{buzzedPlayer?.name ?? "Jemand"} hat gebuzzert!</p>
          }
          <p className="text-gray-700 text-xs">Warte auf den Spielleiter…</p>
        </div>
      )}
    </main>
  );
}
