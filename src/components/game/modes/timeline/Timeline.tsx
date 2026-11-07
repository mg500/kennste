"use client";

import { Fragment } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Check, Music, X } from "lucide-react";
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

/**
 * The revealed song where it belongs, with everyone who put it there on the card – so being right means
 * "I'm on the card", not "my marker is next to it".
 */
function ResultCard({ card, voters, mine, large }: { card: TimelineCard; voters: GapVotes[number]; mine: boolean; large?: boolean }) {
  return (
    <li className={`bubble-in relative flex flex-col gap-2 rounded-2xl bg-surface p-3 ring-[3px] ring-positive ring-inset lg:min-h-48 lg:w-56 lg:p-4 ${large ? "lg:w-64" : ""}`}
      aria-label={`${card.year}: ${card.name} – ${voters.length ? `richtig: ${voters.map(v => v.name).join(", ")}` : "niemand lag richtig"}`}>
      {mine && (
        <span className="absolute -top-3 right-3 inline-flex h-6 items-center gap-1 rounded-full bg-positive px-2.5 text-xs font-extrabold text-on-accent">
          <Check size={13} strokeWidth={3.5} aria-hidden />Dein Tipp
        </span>
      )}
      <div className="flex items-center gap-3 lg:flex-col lg:items-start lg:gap-1.5">
        <span className={`w-20 shrink-0 font-display font-extrabold text-positive-text tabular-nums lg:w-auto lg:text-5xl ${large ? "text-4xl" : "text-3xl"}`}>{card.year}</span>
        <span className="flex min-w-0 flex-col lg:w-full">
          <span className="truncate font-bold lg:line-clamp-2 lg:whitespace-normal">{card.name}</span>
          <span className="truncate text-sm text-muted">{card.artist} · neu</span>
        </span>
      </div>
      <span className="flex flex-wrap items-center gap-1.5 text-sm text-muted lg:mt-auto">
        {voters.length ? <>
          <Check size={16} strokeWidth={3} className="text-positive-text" aria-hidden />
          {voters.map(v => (
            <span key={v.id} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-surface-2 pr-2.5 pl-0.5 font-bold text-text">
              <Avatar name={v.name} color={v.color} size={24} />{v.name}
            </span>
          ))}
        </> : "Niemand lag richtig"}
      </span>
    </li>
  );
}

/** A gap someone put the song in, but it doesn't belong there – your own stands out. */
function WrongSlot({ voters, myId }: { voters: GapVotes[number]; myId?: string }) {
  const mine = voters.some(v => v.id === myId);
  return (
    <li aria-label={`Daneben: ${voters.map(v => (v.id === myId ? "dein Tipp" : v.name)).join(", ")}`}
      className={`flex h-10 items-center gap-2 rounded-xl border-2 border-dashed px-2.5 text-sm font-bold lg:h-48 lg:w-24 lg:flex-col lg:justify-center lg:rounded-2xl ${mine ? "border-buzz text-buzz-text" : "border-surface-2 text-muted"}`}>
      <X size={14} strokeWidth={3} aria-hidden />
      <span className="flex-1 lg:hidden">{mine ? "Dein Tipp – daneben" : "daneben"}</span>
      <span className="flex -space-x-1.5 opacity-80 lg:flex-col lg:space-x-0 lg:gap-1.5">
        {voters.map(v => <span key={v.id} className="rounded-full ring-2 ring-bg"><Avatar name={v.name} color={v.color} size={24} /></span>)}
      </span>
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
export function Timeline({ cards, selected, onSelect, selectedLabel, extra, marker, votes, result, highlightId, large }: {
  cards: TimelineCard[];
  selected?: number | null;
  onSelect?: (index: number) => void;
  selectedLabel?: string;
  /** Coop: suggested gaps. */
  votes?: GapVotes;
  extra?: { index: number; card: TimelineCard; tone: CardTone };
  /** After everyone placed the same song: the card where it belongs with who was right, the wrong gaps with who chose them. */
  result?: { index: number; card: TimelineCard; right: GapVotes[number]; wrong: GapVotes; myId?: string };
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
      {!!result?.wrong[i]?.length && <WrongSlot voters={result.wrong[i]} myId={result.myId} />}
      {result?.index === i && <ResultCard card={result.card} voters={result.right} mine={result.right.some(v => v.id === result.myId)} large={large} />}
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

/** A gap of `cards` in words: "zwischen 1975 und 1991", "vor 1975", "nach 2014". */
export function gapText(cards: TimelineCard[], index: number): string {
  const older = cards[index - 1]?.year;
  const newer = cards[index]?.year;
  return older && newer ? `zwischen ${older} und ${newer}` : newer ? `vor ${newer}` : older ? `nach ${older}` : "";
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
