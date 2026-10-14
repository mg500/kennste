"use client";

import { useEffect, useState } from "react";
import type { LastResult } from "@/lib/game/modes/buzzer";
import type { SongInfo, Track } from "@/lib/game/types";

export const DEFAULT_ACCENT = "#1DB954";

const BLUR = { filter: "blur(12px)" };

export function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Seconds left of `limitSec` since `since` (ms timestamp), ticking. Null when there is no limit. */
export function useCountdown(limitSec: number, since: number | undefined, active: boolean): number | null {
  const [now, setNow] = useState(() => Date.now());
  const running = active && !!since && limitSec > 0;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [running]);
  if (!running) return null;
  return Math.ceil(Math.max(0, limitSec - (now - since!) / 1000));
}

export function Divider({ accentColor = DEFAULT_ACCENT }: { accentColor?: string }) {
  return <div className="w-full border-t" style={{ borderColor: accentColor + "40" }} />;
}

export function Label({ children, pulse }: { children: React.ReactNode; pulse?: boolean }) {
  return (
    <p className={`text-gray-500 text-xs tracking-widest uppercase text-center w-full ${pulse ? "animate-pulse" : ""}`}>
      {children}
    </p>
  );
}

/** Album cover with title, artist and year. Parts not in `revealed` are blurred. */
export function SongCard({ song, revealed, faded }: {
  song: SongInfo;
  revealed?: { cover?: boolean; title?: boolean; artist?: boolean; year?: boolean };
  faded?: boolean;
}) {
  const show = (part: keyof NonNullable<typeof revealed>) => !revealed || revealed[part];
  return (
    <div className={`flex flex-col items-center gap-3 ${faded ? "opacity-40" : ""}`}>
      {song.albumArt && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={song.albumArt} alt="" className="w-48 h-48 rounded-xl shadow-2xl"
          style={show("cover") ? undefined : BLUR}
          onContextMenu={show("cover") ? undefined : e => e.preventDefault()} />
      )}
      <div className="text-center" style={revealed ? { userSelect: "none", pointerEvents: "none" } : undefined}>
        <p className="text-white font-bold text-lg" style={show("title") ? undefined : BLUR}>{song.name}</p>
        <p className="text-gray-400 text-sm" style={show("artist") ? undefined : BLUR}>{song.artist}</p>
        {song.releaseYear && <p className="text-gray-600 text-sm" style={show("year") ? undefined : BLUR}>{song.releaseYear}</p>}
      </div>
    </div>
  );
}

export function TrackRow({ track, onClick, children }: { track: Track; onClick?: () => void; children?: React.ReactNode }) {
  const content = (
    <>
      {track.albumArt && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={track.albumArt} alt="" className="w-8 h-8 rounded shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{track.name}</p>
        <p className="text-xs text-gray-500 truncate">{track.artist}</p>
      </div>
      {children}
    </>
  );
  return onClick ? (
    <button onClick={onClick} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-900 text-left transition">
      {content}
    </button>
  ) : (
    <div className="flex items-center gap-2 bg-gray-900 rounded-lg px-3 py-2">{content}</div>
  );
}

export function PlayPauseButton({ isPlaying, onPlay, onPause }: { isPlaying: boolean; onPlay: () => void; onPause: () => void }) {
  return (
    <button onClick={isPlaying ? onPause : onPlay} aria-label={isPlaying ? "Pause" : "Abspielen"}
      className="text-sm text-white/60 hover:text-white border border-gray-700 hover:border-gray-500 px-5 py-2 rounded-lg transition">
      {isPlaying ? (
        <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor"><rect x="0" y="0" width="3" height="12" rx="1"/><rect x="7" y="0" width="3" height="12" rx="1"/></svg>
      ) : (
        <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor"><path d="M0 0v12l10-6z"/></svg>
      )}
    </button>
  );
}

export function HintButton({ onClick, label, accentColor = DEFAULT_ACCENT }: { onClick: () => void; label: string; accentColor?: string }) {
  return (
    <div className="relative group">
      <button onClick={onClick}
        style={{ color: accentColor, borderColor: accentColor + "60" }}
        className="text-sm px-3 py-2 rounded-lg border transition hover:opacity-80">
        {label}
      </button>
      <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color: accentColor }}>
        Tipp geben
      </span>
    </div>
  );
}

export function PlaybackBar({ current, duration, isPlaying, accentColor = DEFAULT_ACCENT, onSeek }: {
  current: number; duration: number; isPlaying: boolean; accentColor?: string; onSeek?: (ms: number) => void;
}) {
  if (!duration) return null;
  const pct = Math.min((current / duration) * 100, 100);
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    const bar = e.currentTarget.querySelector<HTMLDivElement>("[data-bar]") ?? e.currentTarget;
    const rect = bar.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(Math.round(pos * duration));
  };
  return (
    <div className="w-full">
      <div className={`w-full py-2 ${onSeek ? "cursor-pointer" : ""}`} onClick={handleClick}>
        <div data-bar className="w-full bg-gray-800 rounded-full h-1.5">
          <div className="rounded-full h-1.5 pointer-events-none"
            style={{ width: `${pct}%`, backgroundColor: accentColor, transition: isPlaying ? "width 0.5s linear" : "none" }} />
        </div>
      </div>
      <div className="flex justify-between text-xs text-gray-600">
        <span>{formatTime(Math.min(current, duration))}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}

export function Countdown({ seconds }: { seconds: number | null }) {
  if (seconds === null) return null;
  return <p className={`text-3xl font-light tabular-nums ${seconds <= 5 ? "text-red-400" : "text-gray-400"}`}>{seconds}</p>;
}

export function ResultBanner({ result }: { result: LastResult }) {
  if (result.type === "correct") {
    return <p className="text-green-400 text-sm text-center">{result.byPlayerName ? `${result.byPlayerName} hat es erraten!` : "Richtig erraten!"}</p>;
  }
  if (result.type === "wrong") {
    return <p className="text-red-400 text-sm text-center">{result.byPlayerName ? `${result.byPlayerName} lag falsch` : "Falsch geraten"}</p>;
  }
  return <p className="text-gray-400 text-sm text-center">Song wurde aufgelöst</p>;
}

export function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-600">{label}</span>
      {children}
    </div>
  );
}

export function Stepper({ value, onDec, onInc, disableDec, disableInc, display }: {
  value: number; display?: string;
  onDec: () => void; onInc: () => void;
  disableDec: boolean; disableInc: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={onDec} disabled={disableDec}
        className="w-7 h-7 rounded-full border border-gray-800 hover:border-gray-600 text-gray-400 hover:text-white disabled:opacity-20 transition text-sm">−</button>
      <span className="text-white text-sm w-8 text-center">{display ?? value}</span>
      <button onClick={onInc} disabled={disableInc}
        className="w-7 h-7 rounded-full border border-gray-800 hover:border-gray-600 text-gray-400 hover:text-white disabled:opacity-20 transition text-sm">+</button>
    </div>
  );
}
