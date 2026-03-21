"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

interface Player {
  id: string;
  name: string;
}

interface Game {
  id: string;
  players: Player[];
}

export default function GamePage() {
  const { id } = useParams<{ id: string }>();
  const [game, setGame] = useState<Game | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState("");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch(`/api/game/${id}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!data) setNotFound(true);
        else setGame(data);
      });
  }, [id]);

  useEffect(() => {
    if (!playerId) return;
    pollRef.current = setInterval(() => {
      fetch(`/api/game/${id}`)
        .then(r => (r.ok ? r.json() : null))
        .then(data => { if (data) setGame(data); });
    }, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [playerId, id]);

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
      setPlayerId(data.playerId);
      setGame(data.game);
    }
    setJoining(false);
  };

  if (notFound) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-black text-white">
        <p className="text-gray-500">Spiel nicht gefunden.</p>
      </main>
    );
  }

  if (!game) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-black text-white">
        <p className="text-gray-700">Laden...</p>
      </main>
    );
  }

  if (!playerId) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-black text-white gap-6 p-8">
        <p className="text-gray-600 text-xs tracking-widest uppercase">Erkennst du den Song?</p>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && join()}
          placeholder="Dein Name"
          maxLength={20}
          autoFocus
          className="bg-transparent border-b border-gray-800 focus:border-gray-500 px-2 py-2 text-white placeholder-gray-700 focus:outline-none w-full max-w-xs text-center transition-colors"
        />
        <button
          onClick={join}
          disabled={joining || !name.trim()}
          className="text-sm text-gray-600 hover:text-gray-400 transition disabled:opacity-30"
        >
          Beitreten
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-black text-white gap-6 p-8">
      <p className="text-gray-600 text-xs tracking-widest uppercase">Lobby</p>
      <div className="flex flex-col gap-1 w-full max-w-xs">
        {game.players.map(p => (
          <div
            key={p.id}
            className={`text-sm py-2 px-3 rounded-lg flex items-center justify-between ${p.id === playerId ? "bg-gray-900" : ""}`}
          >
            <span className={p.id === playerId ? "text-white" : "text-gray-500"}>{p.name}</span>
            {p.id === playerId && <span className="text-gray-700 text-xs">du</span>}
          </div>
        ))}
      </div>
      <p className="text-gray-800 text-xs">Warte auf den Spielleiter…</p>
    </main>
  );
}
