"use client";

import type { ReactNode } from "react";
import { Check, X } from "lucide-react";
import { Screen } from "../shared";

/** Every mode: the playlist has no songs left for another round. */
export function OutOfSongs({ header }: { header: ReactNode }) {
  return (
    <Screen desktop header={header}>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <h1 className="font-display text-3xl font-extrabold">Keine Songs mehr</h1>
        <p className="text-muted">Die Playlist ist durchgespielt. Der Host kann das Spiel im Menü beenden.</p>
      </div>
    </Screen>
  );
}

/** How the round went for you: green with the points won (or a check), red with a cross. */
export function Verdict({ good, points, trailing, detail, children }: {
  good: boolean; points?: number; trailing?: ReactNode;
  /** A second, smaller line, e.g. where the song belongs. */
  detail?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div role="status" className={`bubble-in flex items-center gap-3 rounded-card p-4 font-bold text-on-accent ${good ? "bg-positive" : "bg-buzz"}`}>
      {points ? <span className="font-display text-3xl font-extrabold">+{points}</span>
        : good ? <Check size={24} strokeWidth={3} aria-hidden /> : <X size={24} strokeWidth={3} aria-hidden />}
      <span className="flex flex-1 flex-col">
        <span className="text-lg">{children}</span>
        {detail && <span className="text-sm font-medium">{detail}</span>}
      </span>
      {trailing}
    </div>
  );
}
