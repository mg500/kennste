"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

interface NowPlaying {
  isPlaying: boolean;
  title?: string;
  artist?: string;
  album?: string;
  albumArt?: string;
  songUrl?: string;
  progressMs?: number;
  durationMs?: number;
  popularity?: number;
  releaseYear?: string;
  explicit?: boolean;
  trackNumber?: number;
  totalTracks?: number;
  albumType?: "album" | "single" | "compilation";
  genres?: string[] | null;
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
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const fetchedAtRef = useRef(Date.now());

  useEffect(() => {
    if (!session) return;

    const fetchNowPlaying = async () => {
      const res = await fetch("/api/spotify/now-playing");
      const data = await res.json();
      setNowPlaying(data);
      if (data.progressMs != null) {
        progressRef.current = data.progressMs;
        fetchedAtRef.current = Date.now();
        setProgress(data.progressMs);
      }
    };

    fetchNowPlaying();
    const interval = setInterval(fetchNowPlaying, 10000);
    return () => clearInterval(interval);
  }, [session]);

  useEffect(() => {
    if (!nowPlaying?.isPlaying) return;
    const interval = setInterval(() => {
      setProgress(progressRef.current + (Date.now() - fetchedAtRef.current));
    }, 1000);
    return () => clearInterval(interval);
  }, [nowPlaying?.isPlaying]);

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
    <main className="min-h-screen flex flex-col items-center justify-center bg-black text-white gap-8 p-8">
      <h1 className="text-3xl font-bold">Spotify Playground</h1>

      {nowPlaying?.isPlaying ? (
        <div className="flex flex-col items-center gap-5 w-full max-w-sm">
          {nowPlaying.albumArt && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={nowPlaying.albumArt}
              alt={nowPlaying.album}
              className="w-64 h-64 rounded-xl shadow-2xl"
            />
          )}

          <div className="text-center w-full">
            <div className="flex items-center justify-center gap-2">
              <a
                href={nowPlaying.songUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xl font-bold hover:underline"
              >
                {nowPlaying.title}
              </a>
              {nowPlaying.explicit && (
                <span className="text-xs bg-gray-600 text-gray-300 px-1.5 py-0.5 rounded font-bold shrink-0">
                  E
                </span>
              )}
            </div>
            <p className="text-gray-400">{nowPlaying.artist}</p>
            <p className="text-gray-600 text-sm">
              {nowPlaying.album}
              {nowPlaying.releaseYear && ` · ${nowPlaying.releaseYear}`}
              {nowPlaying.albumType && ` · ${albumTypeLabel[nowPlaying.albumType] ?? nowPlaying.albumType}`}
            </p>
            {nowPlaying.trackNumber != null && nowPlaying.totalTracks != null && (
              <p className="text-gray-700 text-xs mt-0.5">
                Track {nowPlaying.trackNumber} / {nowPlaying.totalTracks}
              </p>
            )}
          </div>

          {nowPlaying.durationMs != null && (
            <div className="w-full">
              <div className="w-full bg-gray-800 rounded-full h-1">
                <div
                  className="bg-white rounded-full h-1 transition-all duration-1000"
                  style={{ width: `${Math.min((progress / nowPlaying.durationMs) * 100, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-600 mt-1">
                <span>{formatTime(Math.min(progress, nowPlaying.durationMs))}</span>
                <span>{formatTime(nowPlaying.durationMs)}</span>
              </div>
            </div>
          )}

          <span className="text-green-500 text-sm font-medium animate-pulse">▶ Spielt gerade</span>

          {nowPlaying.popularity != null && (
            <div className="w-full bg-gray-900 rounded-lg p-3">
              <div className="flex justify-between text-xs text-gray-500 mb-2">
                <span>Popularität</span>
                <span>{nowPlaying.popularity} / 100</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-1">
                <div
                  className="bg-green-500 rounded-full h-1"
                  style={{ width: `${nowPlaying.popularity}%` }}
                />
              </div>
            </div>
          )}

          {nowPlaying.genres && nowPlaying.genres.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-center">
              {nowPlaying.genres.map((genre) => (
                <span key={genre} className="text-xs bg-gray-900 text-gray-400 px-3 py-1 rounded-full">
                  {genre}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="text-gray-500">Gerade läuft nichts.</p>
      )}

      <button onClick={() => signOut()} className="text-gray-600 hover:text-gray-400 text-sm transition">
        Abmelden
      </button>
    </main>
  );
}
