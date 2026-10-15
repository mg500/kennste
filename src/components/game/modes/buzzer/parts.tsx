"use client";

import type { ReactNode } from "react";
import { HelpCircle, Music } from "lucide-react";
import type { HintField } from "@/lib/game/modes/buzzer";
import type { Track } from "@/lib/game/types";
export { useCountdown } from "@/components/ui/useCountdown";

/** Album cover, or a playful blurred placeholder while it is still hidden. */
export function Cover({ track, hidden, size }: { track?: Track; hidden?: boolean; size: number }) {
  const radius = Math.round(size / 6.5);
  if (hidden || !track?.albumArt) {
    return (
      <div role="img" aria-label={hidden ? "Cover verdeckt" : "Kein Cover"} className="relative shrink-0 overflow-hidden bg-surface"
        style={{ width: size, height: size, borderRadius: radius }}>
        {hidden && track?.albumArt && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={track.albumArt} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-125 object-cover"
            style={{ filter: `blur(${Math.round(size / 8)}px) saturate(1.3)` }} onContextMenu={e => e.preventDefault()} />
        )}
        <span className="absolute inset-0 flex items-center justify-center text-text/80">
          {hidden ? <HelpCircle size={size / 4} aria-hidden /> : <Music size={size / 4} aria-hidden />}
        </span>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={track.albumArt} alt={`Cover von ${track.album ?? track.name}`} className="shrink-0 object-cover shadow-2xl" style={{ width: size, height: size, borderRadius: radius }} />;
}

/** Title / artist / year — hidden parts shown as placeholders, revealed hints highlighted. */
export function HintFields({ track, revealed, large }: { track: Track; revealed: Record<HintField, boolean>; large?: boolean }) {
  const fields: { field: HintField; label: string; value?: string; width: number }[] = [
    { field: "title", label: "Titel", value: track.name, width: 120 },
    { field: "artist", label: "Interpret", value: track.artist, width: 100 },
    { field: "year", label: "Jahr", value: track.releaseYear, width: 56 },
  ];
  return (
    <dl className={`flex min-w-0 flex-col ${large ? "gap-4" : "gap-2"}`}>
      {fields.filter(f => f.value).map(f => (
        <div key={f.field} className="flex min-w-0 flex-col gap-0.5">
          <dt className={`font-bold uppercase tracking-wider text-muted ${large ? "text-base" : "text-xs"}`}>{f.label}</dt>
          {revealed[f.field] ? (
            <dd className={`truncate font-bold text-positive ${large ? "text-3xl" : "text-lg"}`}>{f.value}</dd>
          ) : (
            <dd aria-label="verdeckt" className="rounded-md bg-surface-2" style={{ width: large ? f.width * 2 : f.width, height: large ? 36 : 22 }} />
          )}
        </div>
      ))}
    </dl>
  );
}

export function TrackRow({ track, onClick, note, children }: { track: Track; onClick?: () => void; note?: string; children?: ReactNode }) {
  const content = (
    <>
      {track.albumArt
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={track.albumArt} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
        : <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-2"><Music size={18} aria-hidden /></span>}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{track.name}</span>
        <span className="truncate text-sm text-muted">{track.artist}{track.releaseYear && ` · ${track.releaseYear}`}</span>
      </span>
      {note && <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold text-muted">{note}</span>}
      {children}
    </>
  );
  return onClick ? (
    <button onClick={onClick} disabled={!!note} className="flex w-full items-center gap-3 rounded-2xl p-2 text-left transition hover:bg-surface disabled:opacity-50 disabled:hover:bg-transparent">{content}</button>
  ) : (
    <div className={`flex items-center gap-3 rounded-2xl bg-surface p-2 ${note ? "opacity-60" : ""}`}>{content}</div>
  );
}
