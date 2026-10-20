"use client";

import { Fragment } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Music } from "lucide-react";
import type { TimelineCard } from "@/lib/game/modes/timeline";
import { Avatar } from "@/components/ui/primitives";

/** Players suggesting a gap (coop games), shown as avatars in it. */
export type GapVotes = Record<number, { id: string; name: string; color: string }[]>;

function Votes({ voters }: { voters?: GapVotes[number] }) {
  if (!voters?.length) return null;
  return (
    <span className="flex -space-x-1.5" aria-label={`Vorschlag von ${voters.map(v => v.name).join(", ")}`}>
      {voters.map(v => <span key={v.id} className="rounded-full ring-2 ring-bg"><Avatar name={v.name} color={v.color} size={24} /></span>)}
    </span>
  );
}

type CardTone = "normal" | "new" | "misplaced";

function Card({ card, tone = "normal", large }: { card: TimelineCard; tone?: CardTone; large?: boolean }) {
  const toneClass = tone === "new" ? "bg-positive text-on-accent"
    : tone === "misplaced" ? "border-2 border-dashed border-positive bg-transparent text-text"
    : "bg-surface text-text";
  return (
    <li className={`flex items-center gap-3 rounded-2xl px-3 lg:h-48 lg:w-40 lg:flex-col lg:items-start lg:gap-1.5 lg:p-4 ${large ? "h-20" : "h-16"} ${toneClass}`}>
      <span className={`w-20 shrink-0 font-display font-extrabold tabular-nums lg:w-auto lg:text-5xl ${large ? "text-4xl" : "text-3xl"}`}>{card.year}</span>
      <span className="flex min-w-0 flex-col lg:w-full">
        <span className="truncate font-bold lg:line-clamp-2 lg:whitespace-normal">{card.name}</span>
        <span className={`truncate text-sm ${tone === "new" ? "" : "text-muted"}`}>{card.artist}</span>
      </span>
      {tone === "misplaced" && <span className="ml-auto shrink-0 text-xs font-bold text-positive-text lg:mt-auto lg:ml-0">gehört hierhin</span>}
    </li>
  );
}

function Slot({ index, selected, onSelect, label, selectedLabel = "Hier", aim, voters }: {
  index: number; selected: boolean; onSelect: (i: number) => void; label: string; selectedLabel?: string;
  /** Where the active player points (shown while others suggest). */
  aim?: string; voters?: GapVotes[number];
}) {
  const wide = selected || aim || voters?.length;
  const tone = selected ? "border-primary bg-primary text-on-accent"
    : aim ? "animate-pulse border-primary bg-primary/15 text-primary-text"
    : voters?.length ? "border-muted text-muted hover:text-text" : "border-surface-2 text-muted hover:border-muted hover:text-text";
  return (
    <li>
      <button onClick={() => onSelect(index)} aria-pressed={selected} aria-label={aim ? `${label} – ${aim}` : label}
        className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed px-2 text-sm font-bold transition lg:h-48 lg:flex-col lg:rounded-2xl ${tone} ${wide ? "lg:w-24" : "lg:w-13"}`}>
        {selected ? selectedLabel : aim ?? (voters?.length ? null : "+")}
        <Votes voters={voters} />
      </button>
    </li>
  );
}

export interface TimelineMarker {
  index: number;
  label: string;
  /** aim: where the active player is pointing right now; wrong: where a card was wrongly placed */
  tone: "aim" | "wrong";
}

/** A gap highlighted for others to see (not clickable). */
function Marker({ marker, voters }: { marker?: TimelineMarker | null; voters?: GapVotes[number] }) {
  const tone = !marker ? "border-muted text-muted" : marker.tone === "aim" ? "border-primary bg-primary/15 text-primary-text" : "border-buzz bg-buzz/15 text-buzz-text";
  return (
    <li aria-label={marker?.label}
      className={`flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-dashed px-2 text-center text-sm font-bold lg:h-48 lg:w-24 lg:flex-col lg:rounded-2xl ${tone} ${marker?.tone === "aim" ? "animate-pulse" : ""}`}>
      {marker?.label}
      <Votes voters={voters} />
    </li>
  );
}

/** Phones: "Neuer" above, "Älter" below. Desktop: one row above, "Älter" left and "Neuer" right. */
function Axis({ end }: { end: "top" | "bottom" }) {
  const cls = "flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted";
  if (end === "top") {
    return (
      <div className="flex items-center justify-between">
        <span className={`${cls} lg:hidden`}><ArrowUp size={14} aria-hidden />Neuer</span>
        <span className={`${cls} hidden lg:flex`}>Älter</span>
        <span className={`${cls} hidden lg:flex`}>Neuer<ArrowRight size={14} aria-hidden /></span>
      </div>
    );
  }
  return <span className={`${cls} lg:hidden`}><ArrowDown size={14} aria-hidden />Älter</span>;
}

/**
 * A player's cards sorted by year, oldest first in the DOM: shown newest on top on phones
 * (column-reverse) and oldest on the left on desktop. With `onSelect`,
 * gaps between cards are selectable slots; `extra` inserts an additional card (the revealed song)
 * and `marker` highlights a gap.
 */
export function Timeline({ cards, selected, onSelect, selectedLabel, extra, marker, votes, highlightId, large }: {
  cards: TimelineCard[];
  selected?: number | null;
  onSelect?: (index: number) => void;
  selectedLabel?: string;
  /** Coop: suggested gaps. */
  votes?: GapVotes;
  extra?: { index: number; card: TimelineCard; tone: CardTone };
  marker?: TimelineMarker | null;
  /** Card to mark as newly won. */
  highlightId?: string;
  large?: boolean;
}) {
  const slotLabel = (i: number) =>
    i === 0 ? `Vor ${cards[0]?.year ?? "allen Karten"}` : i === cards.length ? `Nach ${cards[i - 1].year}` : `Zwischen ${cards[i - 1].year} und ${cards[i].year}`;
  const gap = (i: number) => (
    <>
      {onSelect && <Slot index={i} selected={selected === i} onSelect={onSelect} label={slotLabel(i)} selectedLabel={selectedLabel}
        aim={marker?.tone === "aim" && marker.index === i ? marker.label : undefined} voters={votes?.[i]} />}
      {!onSelect && (marker?.index === i || !!votes?.[i]?.length) && <Marker marker={marker?.index === i ? marker : null} voters={votes?.[i]} />}
      {extra?.index === i && <Card card={extra.card} tone={extra.tone} large={large} />}
    </>
  );
  return (
    <div className="flex flex-col gap-2">
      <Axis end="top" />
      <ol className="flex flex-col-reverse gap-1.5 lg:flex-row lg:flex-wrap lg:gap-2.5" aria-label="Zeitstrahl, älteste Karte zuerst">
        {cards.map((card, i) => (
          <Fragment key={card.trackId}>
            {gap(i)}
            <Card card={card} large={large} tone={card.trackId === highlightId ? "new" : "normal"} />
          </Fragment>
        ))}
        {gap(cards.length)}
      </ol>
      <Axis end="bottom" />
    </div>
  );
}

/** The hidden song being placed. */
export function MysteryCard({ size = 96, children }: { size?: number; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 rounded-card bg-buzz p-3 text-on-accent">
      <span className="inline-flex shrink-0 items-center justify-center rounded-2xl bg-on-accent/15" style={{ width: size, height: size }}>
        <Music size={size / 2.6} aria-hidden className="animate-pulse" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">{children}</div>
    </div>
  );
}
