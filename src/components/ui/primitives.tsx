"use client";

import type { ReactNode } from "react";
import { Minus, Plus } from "lucide-react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`bg-surface rounded-card p-4 ${className}`}>{children}</div>;
}

export function Chip({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-bg text-sm ${className}`}>{children}</span>;
}

export function Pill({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center h-9 px-3 rounded-full bg-surface font-bold text-sm ${className}`}>{children}</span>;
}

/** Round player avatar with initial; `color` is a CSS color (see playerColor). */
export function Avatar({ name, color, size = 40 }: { name: string; color: string; size?: number }) {
  return (
    <span aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-on-accent"
      style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function IconButton({ label, onClick, children, className = "" }: { label: string; onClick?: () => void; children: ReactNode; className?: string }) {
  return (
    <button onClick={onClick} aria-label={label}
      className={`inline-flex shrink-0 items-center justify-center w-11 h-11 rounded-full bg-surface text-text hover:brightness-125 transition ${className}`}>
      {children}
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, disabled }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" className="inline-flex p-1 gap-1 rounded-2xl bg-bg">
      {options.map(o => (
        <button key={o.value} role="radio" aria-checked={value === o.value} disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`h-9 px-3 rounded-xl text-sm font-bold transition ${value === o.value ? "bg-surface-2 text-text" : "text-muted hover:text-text"} disabled:cursor-default`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({ value, display, min, max, step = 1, onChange, disabled, label }: {
  value: number; display?: string; min: number; max: number; step?: number;
  onChange: (value: number) => void; disabled?: boolean; label: string;
}) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <button aria-label={`${label} verringern`} disabled={disabled || value <= min} onClick={() => onChange(Math.max(min, value - step))}
        className="w-10 h-10 rounded-xl bg-surface-2 text-text inline-flex items-center justify-center disabled:opacity-30 transition">
        <Minus size={18} aria-hidden />
      </button>
      <span className="min-w-12 text-center font-bold tabular-nums">{display ?? value}</span>
      <button aria-label={`${label} erhöhen`} disabled={disabled || value >= max} onClick={() => onChange(Math.min(max, value + step))}
        className="w-10 h-10 rounded-xl bg-surface-2 text-text inline-flex items-center justify-center disabled:opacity-30 transition">
        <Plus size={18} aria-hidden />
      </button>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-4 w-full min-h-12 text-left">
      <span>{label}</span>
      <span className={`relative w-12 h-7 rounded-full transition-colors ${checked ? "bg-positive" : "bg-surface-2"}`}>
        <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-text transition-transform ${checked ? "translate-x-5" : ""}`} />
      </span>
    </button>
  );
}

/** Labeled row inside settings lists. */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-14 border-b border-surface-2 last:border-0">
      <span>{label}</span>
      {children}
    </div>
  );
}

/** Circular countdown ring. `progress` 0…1 is the remaining share. */
export function TimerRing({ size, stroke, progress, color = "var(--positive)", track = "var(--surface)", children }: {
  size: number; stroke: number; progress: number; color?: string; track?: string; children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, progress)))}
          style={{ transition: "stroke-dashoffset 0.5s linear" }} />
      </svg>
      {children && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
    </div>
  );
}

export function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function ProgressBar({ current, duration, isPlaying, onSeek, thick }: {
  current: number; duration: number; isPlaying: boolean; onSeek?: (ms: number) => void; thick?: boolean;
}) {
  if (!duration) return null;
  const pct = Math.min((current / duration) * 100, 100);
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    onSeek(Math.round(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration));
  };
  return (
    <div className="w-full flex flex-col gap-1.5">
      <div onClick={seek} className={`py-2 ${onSeek ? "cursor-pointer" : ""}`}
        role={onSeek ? "slider" : "progressbar"} aria-label="Wiedergabeposition"
        aria-valuemin={0} aria-valuemax={Math.round(duration / 1000)} aria-valuenow={Math.round(current / 1000)}>
        <div className={`relative w-full rounded-full bg-surface ${thick ? "h-3" : "h-2"}`}>
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%`, transition: isPlaying ? "width 0.5s linear" : "none" }} />
          {onSeek && <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-primary" style={{ left: `${pct}%` }} />}
        </div>
      </div>
      <div className={`flex justify-between text-muted tabular-nums ${thick ? "text-base" : "text-xs"}`}>
        <span>{formatTime(Math.min(current, duration))}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}

/** Seconds of a countdown at a fixed width (digits of the limit), so text next to it doesn't move while it counts down. */
export function TimerDigits({ left }: { left: { seconds: number; limit: number } }) {
  return <span className="inline-block text-right tabular-nums" style={{ minWidth: `${String(left.limit).length}ch` }}>{left.seconds}</span>;
}
