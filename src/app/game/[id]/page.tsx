"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { GameView } from "@/components/game/GameView";
import { loadCredentials, saveCredentials, type Credentials } from "@/lib/game/client";
import { useGameSession } from "@/lib/game/useGameSession";

function Message({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-black text-white gap-6 p-8">
      {children}
    </main>
  );
}

export default function GamePage() {
  const { id } = useParams<{ id: string }>();
  // undefined until restored from sessionStorage
  const [creds, setCreds] = useState<Credentials | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const { game, notFound, playback, notice, controls, applyGame } = useGameSession(id, creds ?? null);

  // Restore credentials after a reload (sessionStorage is only available on the client)
  useEffect(() => {
    setCreds(loadCredentials(id));
  }, [id]);

  const updateCreds = (next: Credentials | null) => {
    saveCredentials(id, next);
    setCreds(next);
  };

  const join = async () => {
    if (!name.trim() || joining) return;
    setJoining(true);
    setJoinError(null);
    const res = await fetch(`/api/game/${id}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (res?.ok) {
      updateCreds({ playerId: data.playerId, token: data.token });
      applyGame(data.game);
    } else {
      setJoinError(data?.error ?? "Beitreten fehlgeschlagen");
    }
    setJoining(false);
  };

  if (notFound) return <Message><p className="text-gray-500">Das Spiel wurde beendet.</p></Message>;
  if (!game || creds === undefined) return <Message><p className="text-gray-700">Laden…</p></Message>;

  const isMember = !!creds && [...game.players, ...(game.viewerPlayers ?? [])].some(p => p.id === creds.playerId);

  if (creds && !isMember) return (
    <Message>
      <p className="text-gray-500 text-sm">
        {game.status === "lobby" ? "Du wurdest aus der Lobby entfernt." : "Du bist nicht mehr im Spiel."}
      </p>
      {game.status === "lobby" && (
        <button onClick={() => updateCreds(null)} className="text-sm text-gray-600 hover:text-gray-400 transition">
          Erneut beitreten
        </button>
      )}
    </Message>
  );

  if (!creds || !controls) {
    if (game.status !== "lobby") return <Message><p className="text-gray-500">Das Spiel hat bereits begonnen.</p></Message>;
    return (
      <Message>
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
        {joinError && <p className="text-xs text-red-600">{joinError}</p>}
      </Message>
    );
  }

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
      <GameView game={game} controls={controls} myId={creds.playerId} playback={playback} notice={notice} />
    </main>
  );
}
