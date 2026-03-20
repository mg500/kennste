"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";

interface NowPlaying {
  isPlaying: boolean;
  title?: string;
  artist?: string;
  album?: string;
  albumArt?: string;
  songUrl?: string;
}

export default function Home() {
  const { data: session, status } = useSession();
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);

  useEffect(() => {
    if (!session) return;

    const fetchNowPlaying = async () => {
      const res = await fetch("/api/spotify/now-playing");
      const data = await res.json();
      setNowPlaying(data);
    };

    fetchNowPlaying();
    const interval = setInterval(fetchNowPlaying, 10000);
    return () => clearInterval(interval);
  }, [session]);

  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-black text-white">
        <p>Laden...</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-black text-white gap-6">
        <h1 className="text-3xl font-bold">Spotify Playground</h1>
        <button
          onClick={() => signIn("spotify")}
          className="bg-green-500 hover:bg-green-400 text-black font-semibold px-8 py-3 rounded-full transition"
        >
          Mit Spotify anmelden
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-black text-white gap-8">
      <h1 className="text-3xl font-bold">Spotify Playground</h1>

      {nowPlaying?.isPlaying ? (
        <div className="flex flex-col items-center gap-4 max-w-sm w-full">
          {nowPlaying.albumArt && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={nowPlaying.albumArt}
              alt={nowPlaying.album}
              className="w-64 h-64 rounded-xl shadow-2xl"
            />
          )}
          <div className="text-center">
            <a
              href={nowPlaying.songUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xl font-bold hover:underline"
            >
              {nowPlaying.title}
            </a>
            <p className="text-gray-400">{nowPlaying.artist}</p>
            <p className="text-gray-600 text-sm">{nowPlaying.album}</p>
          </div>
          <span className="text-green-500 text-sm font-medium animate-pulse">
            ▶ Spielt gerade
          </span>
        </div>
      ) : (
        <p className="text-gray-500">Gerade läuft nichts.</p>
      )}

      <button
        onClick={() => signOut()}
        className="text-gray-600 hover:text-gray-400 text-sm transition"
      >
        Abmelden
      </button>
    </main>
  );
}
