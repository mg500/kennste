"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import Visualizer, { type VisStyle } from "./visualizer";

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
  bpm?: number | null;
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
  const [visualizer, setVisualizer] = useState<"off" | "simulated" | "microphone">("off");
  const [visStyle, setVisStyle] = useState<VisStyle>("bars");
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
              {nowPlaying.title && nowPlaying.artist && (
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(`${nowPlaying.title} ${nowPlaying.artist}`)}`}
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
            <p className="text-gray-400">{nowPlaying.artist}</p>
            <p className="text-gray-600 text-sm">
              {nowPlaying.album}
              {nowPlaying.releaseYear && ` · ${nowPlaying.releaseYear}`}
              {nowPlaying.albumType && ` · ${albumTypeLabel[nowPlaying.albumType] ?? nowPlaying.albumType}`}
            </p>
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

          {nowPlaying.popularity != null && (
            <div className="w-full bg-gray-900 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-2">Popularität</p>
              <div className="w-full bg-gray-800 rounded-full h-1 mb-1">
                <div
                  className="bg-green-500 rounded-full h-1"
                  style={{ width: `${nowPlaying.popularity}%` }}
                />
              </div>
              <p className="text-xs text-gray-600 text-right">{nowPlaying.popularity} / 100</p>
            </div>
          )}

          {(nowPlaying.genres && nowPlaying.genres.length > 0 || nowPlaying.bpm != null) && (
            <div className="flex flex-wrap gap-2 justify-center">
              {nowPlaying.genres?.map((genre) => (
                <span key={genre} className="text-xs bg-gray-900 text-gray-400 px-3 py-1 rounded-full">
                  {genre}
                </span>
              ))}
              {nowPlaying.bpm != null && (
                <span className="text-xs bg-gray-900 text-gray-400 px-3 py-1 rounded-full">
                  {nowPlaying.bpm} BPM
                </span>
              )}
            </div>
          )}

          <div className="w-full flex flex-col gap-2">
            <div className="flex items-center gap-2 justify-center flex-wrap">
              {visualizer === "off" ? (
                <button
                  onClick={() => setVisualizer("simulated")}
                  className="text-xs text-gray-600 hover:text-gray-400 transition border border-gray-800 hover:border-gray-600 px-2 py-0.5 rounded"
                >
                  Visualizer
                </button>
              ) : (
                <>
                  {(["bars", "wave", "circle"] as VisStyle[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setVisStyle(s)}
                      className={`text-xs px-2 py-0.5 rounded transition border ${visStyle === s ? "border-green-600 text-green-500" : "border-gray-800 text-gray-600 hover:text-gray-400 hover:border-gray-600"}`}
                    >
                      {s === "bars" ? "Balken" : s === "wave" ? "Welle" : "Kreis"}
                    </button>
                  ))}
                  <button
                    onClick={() => setVisualizer(visualizer === "simulated" ? "microphone" : "simulated")}
                    className="text-xs text-gray-500 hover:text-gray-300 transition border border-gray-700 px-2 py-0.5 rounded"
                  >
                    {visualizer === "simulated" ? "→ Mic" : "→ Sim"}
                  </button>
                  <button
                    onClick={() => setVisualizer("off")}
                    className="text-xs text-gray-600 hover:text-gray-400 transition border border-gray-800 hover:border-gray-600 px-2 py-0.5 rounded"
                  >
                    aus
                  </button>
                </>
              )}
            </div>
            {visualizer !== "off" && (
              <Visualizer bpm={nowPlaying.bpm} isPlaying={nowPlaying.isPlaying} mode={visualizer} style={visStyle} />
            )}
          </div>

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
