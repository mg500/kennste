"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

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

function hexToRgb(hex: string) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  h /= 360;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function extractAccentColor(imgSrc: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const size = 50;
      const canvas = document.createElement("canvas");
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve("#1DB954");
      ctx.drawImage(img, 0, 0, size, size);
      const { data } = ctx.getImageData(0, 0, size, size);
      const buckets: Record<number, { count: number; r: number; g: number; b: number; sat: number }> = {};
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const [h, s, l] = rgbToHsl(r, g, b);
        if (s < 0.25 || l < 0.15 || l > 0.85) continue;
        const bucket = Math.floor(h / 15) * 15;
        if (!buckets[bucket]) buckets[bucket] = { count: 0, r: 0, g: 0, b: 0, sat: 0 };
        buckets[bucket].count++;
        buckets[bucket].r += r; buckets[bucket].g += g; buckets[bucket].b += b;
        buckets[bucket].sat += s;
      }
      const entries = Object.values(buckets);
      if (entries.length === 0) return resolve("#1DB954");
      const best = entries.reduce((a, b) =>
        a.count * (a.sat / a.count) > b.count * (b.sat / b.count) ? a : b
      );
      const [h2, , l2] = rgbToHsl(
        Math.round(best.r / best.count),
        Math.round(best.g / best.count),
        Math.round(best.b / best.count),
      );
      resolve(hslToHex(h2, 0.75, Math.max(0.55, Math.min(0.7, l2))));
    };
    img.onerror = () => resolve("#1DB954");
    img.src = imgSrc;
  });
}

const albumTypeLabel: Record<string, string> = {
  album: "Album",
  single: "Single",
  compilation: "Compilation",
};

export default function Home() {
  const { data: session, status } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [progress, setProgress] = useState(0);
  const [visMode, setVisMode] = useState<0 | 1 | 2 | 3>(0);
  const [accentColor, setAccentColor] = useState("#1DB954");
  const progressRef = useRef(0);
  const fetchedAtRef = useRef(Date.now());
  const progressTrackRef = useRef<HTMLDivElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const accentColorRef = useRef(accentColor);
  const visModeRef = useRef<0 | 1 | 2 | 3>(0);
  const micFrameRef = useRef<number>(0);
  const micAudioCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

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
    if (!nowPlaying?.albumArt) { setAccentColor("#1DB954"); return; }
    extractAccentColor(nowPlaying.albumArt).then(setAccentColor);
  }, [nowPlaying?.albumArt]);

  useEffect(() => { accentColorRef.current = accentColor; }, [accentColor]);
  useEffect(() => { visModeRef.current = visMode; }, [visMode]);

  const micActive = visMode > 0;

  useEffect(() => {
    const resetBar = () => {
      if (progressTrackRef.current) progressTrackRef.current.style.height = "";
      if (progressFillRef.current) {
        progressFillRef.current.style.height = "";
        progressFillRef.current.style.boxShadow = "";
        progressFillRef.current.style.background = "";
        progressFillRef.current.style.backgroundColor = "";
        progressFillRef.current.style.opacity = "";
      }
    };
    if (!micActive) { resetBar(); return; }

    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        micStreamRef.current = stream;
        const audioCtx = new AudioContext();
        micAudioCtxRef.current = audioCtx;
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.85;
        audioCtx.createMediaStreamSource(stream).connect(analyser);
        const freqData = new Uint8Array(analyser.frequencyBinCount);

        let shimmerPos = 0;

        const draw = () => {
          analyser.getByteFrequencyData(freqData);
          const avg = freqData.reduce((a, v) => a + v, 0) / freqData.length / 255;
          const mode = visModeRef.current;
          const accent = accentColorRef.current;
          const track = progressTrackRef.current;
          const fill = progressFillRef.current;

          if (mode === 1) {
            // Glow: height expands + shadow
            const h = 4 + avg * 16;
            if (track) track.style.height = `${h}px`;
            if (fill) {
              fill.style.height = `${h}px`;
              fill.style.background = "";
              fill.style.backgroundColor = accent;
              fill.style.boxShadow = `0 0 ${avg * 14}px 1px ${accent}`;
              fill.style.opacity = "1";
            }
          } else if (mode === 2) {
            // Color: brightens toward white with amplitude
            const { r, g, b } = hexToRgb(accent);
            const lr = Math.round(r + (255 - r) * avg * 0.8);
            const lg = Math.round(g + (255 - g) * avg * 0.8);
            const lb = Math.round(b + (255 - b) * avg * 0.8);
            if (track) track.style.height = "";
            if (fill) {
              fill.style.height = "";
              fill.style.background = "";
              fill.style.backgroundColor = `rgb(${lr},${lg},${lb})`;
              fill.style.boxShadow = avg > 0.2 ? `0 0 ${avg * 10}px ${accent}` : "";
              fill.style.opacity = "1";
            }
          } else if (mode === 3) {
            // Shimmer: bright spot moves faster with amplitude
            shimmerPos = (shimmerPos + 0.4 + avg * 18) % 110;
            const p = Math.min(shimmerPos, 100);
            const { r, g, b } = hexToRgb(accent);
            const base = `rgb(${r},${g},${b})`;
            const bright = `rgb(${Math.min(255, r + 120)},${Math.min(255, g + 120)},${Math.min(255, b + 120)})`;
            if (track) track.style.height = "";
            if (fill) {
              fill.style.height = "";
              fill.style.backgroundColor = "";
              fill.style.background = `linear-gradient(to right, ${base} 0%, ${base} ${Math.max(0, p - 6)}%, ${bright} ${p}%, ${base} ${Math.min(100, p + 6)}%, ${base} 100%)`;
              fill.style.boxShadow = "";
              fill.style.opacity = "1";
            }
          }

          micFrameRef.current = requestAnimationFrame(draw);
        };
        micFrameRef.current = requestAnimationFrame(draw);
      } catch {
        setVisMode(0);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(micFrameRef.current);
      micStreamRef.current?.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
      micAudioCtxRef.current?.close();
      micAudioCtxRef.current = null;
      resetBar();
    };
  }, [micActive]);

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
              onClick={() => setMenuOpen(false)}
              className="text-left text-2xl font-light text-white/80 hover:text-white py-3 transition"
            >
              Just Playing
            </button>
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
      {nowPlaying?.isPlaying ? (
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
              <div ref={progressTrackRef} className="w-full bg-gray-800 rounded-full h-1">
                <div
                  ref={progressFillRef}
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

          <div className="flex justify-center">
            <button
              onClick={() => setVisMode(m => ((m + 1) % 4) as 0 | 1 | 2 | 3)}
              className={`text-xs px-2 py-0.5 rounded transition border ${visMode > 0 ? "" : "border-gray-800 text-gray-600 hover:text-gray-400 hover:border-gray-600"}`}
              style={visMode > 0 ? { borderColor: accentColor, color: accentColor } : {}}
            >
              {visMode === 0 ? "Visualizer" : visMode === 1 ? "Glow" : visMode === 2 ? "Color" : "Shimmer"}
            </button>
          </div>

        </div>
      ) : (
        <p className="text-gray-500">Gerade läuft nichts.</p>
      )}

      </div>
    </main>
  );
}
