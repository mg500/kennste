"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveCredentials } from "@/lib/game/client";

interface HostGame { gameId: string; playerId: string; token: string }

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeGame, setActiveGame] = useState<HostGame | null>(null);
  const [creating, setCreating] = useState(false);

  // A game this user is hosting (e.g. started on another device or in another tab)
  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/game/my")
      .then(r => (r.ok ? r.json() : null))
      .then((data: HostGame | null) => setActiveGame(data))
      .catch(() => {});
  }, [status]);

  const openGame = (game: HostGame) => {
    saveCredentials(game.gameId, { playerId: game.playerId, token: game.token });
    router.push(`/game/${game.gameId}`);
  };

  const createGame = async () => {
    setCreating(true);
    const res = await fetch("/api/game/create", { method: "POST" }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      openGame({ gameId: data.game.id, playerId: data.playerId, token: data.token });
    } else {
      setCreating(false);
    }
  };

  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-black text-white">
        <p className="text-gray-700">Laden…</p>
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
          Login
        </button>
        <Link href="/game" className="text-sm text-gray-600 hover:text-gray-400 transition">
          Spiel beitreten
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col justify-center bg-black text-white p-10">
      <nav className="flex flex-col gap-1 w-full max-w-sm mx-auto">
        <Link href="/now-playing" className="text-left text-2xl font-light text-white/80 hover:text-white py-3 transition">
          Just Playing
        </Link>
        {activeGame ? (
          <button onClick={() => openGame(activeGame)} className="text-left text-2xl font-light text-white/80 hover:text-white py-3 transition">
            Erkennst du den Song?
            <span className="ml-2 text-xs text-green-500 font-normal">● aktiv</span>
          </button>
        ) : (
          <button onClick={createGame} disabled={creating} className="text-left text-2xl font-light text-white/80 hover:text-white py-3 transition disabled:opacity-50">
            {creating ? "Spiel wird erstellt…" : "Spiel erstellen"}
          </button>
        )}
        <Link href="/game" className="text-left text-sm font-light text-gray-600 hover:text-gray-400 py-2 transition">
          Spiel beitreten
        </Link>
        <div className="w-8 h-px bg-gray-800 my-2" />
        <button onClick={() => signOut()} className="text-left text-sm font-light text-gray-600 hover:text-gray-400 py-2 transition">
          Abmelden
        </button>
      </nav>
    </main>
  );
}
