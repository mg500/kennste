"use client";

import { Heart } from "lucide-react";
import { Avatar, Pill } from "@/components/ui/primitives";
import { timelineData, TEAM, type TimelineData, type TimelineRound } from "@/lib/game/modes/timeline";
import type { Game } from "@/lib/game/types";
import { MenuOrTheme, playerColor, roundLabel } from "../../shared";
import type { GapVotes } from "./Timeline";

/** The team's remaining lives as hearts. */
export function Lives({ data, size = 18 }: { data: TimelineData; size?: number }) {
  const left = data.livesLeft ?? 0;
  const total = data.settings.lives;
  return (
    <span role="img" aria-label={`${left} von ${total} Leben übrig`} className="inline-flex items-center gap-1">
      {Array.from({ length: total }, (_, i) => (
        <Heart key={i} size={size} aria-hidden className={i < left ? "fill-buzz text-buzz" : "text-muted"} />
      ))}
    </span>
  );
}

/** "Gemeinsam: 6/10 Karten", or the round label for a round goal. */
export function teamLabel(game: Game) {
  const cards = timelineData(game).timelines[TEAM]?.length ?? 0;
  return game.settings.goal === "score" ? `Gemeinsam: ${cards}/${game.settings.targetScore} Karten` : `${roundLabel(game)} · ${cards} Karten`;
}

/** Top bar for coop games: team progress and lives instead of everyone's (identical) score. */
export function CoopTopBar({ game, onMenu }: { game: Game; onMenu?: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <Pill className="shrink-0 lg:h-11 lg:px-5 lg:text-base">{teamLabel(game)}</Pill>
      <Pill className="shrink-0 lg:h-11 lg:px-4"><Lives data={timelineData(game)} /></Pill>
      <div className="flex-1" />
      <MenuOrTheme onMenu={onMenu} />
    </div>
  );
}

/** Suggested gaps grouped by index, for the timeline. */
export function votesOf(game: Game, round: TimelineRound): GapVotes {
  const votes: GapVotes = {};
  for (const [playerId, index] of Object.entries(round.suggestions ?? {})) {
    const p = game.players.find(pl => pl.id === playerId);
    if (p) (votes[index] ??= []).push({ id: p.id, name: p.name, color: playerColor(game, p.id) });
  }
  return votes;
}

/** Team members with their hits, e.g. "2 von 3". */
export function TeamStats({ game, activeId, myId }: { game: Game; activeId?: string; myId?: string }) {
  const stats = timelineData(game).stats ?? {};
  return (
    <ul className="grid grid-cols-2 gap-1.5 lg:grid-cols-1">
      {game.players.map(p => (
        <li key={p.id} className={`flex h-11 items-center gap-2 rounded-xl px-2.5 ${p.id === myId ? "bg-surface-2" : "bg-bg/40"}`}>
          <Avatar name={p.name} color={playerColor(game, p.id)} size={28} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
          <span className="text-xs text-muted">
            {p.id === activeId ? "ist dran" : stats[p.id] ? `${stats[p.id].correct} von ${stats[p.id].total}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Desktop sidebar in coop games. */
export function TeamAside({ game, activeId, myId }: { game: Game; activeId?: string; myId: string }) {
  const data = timelineData(game);
  return (
    <div className="flex flex-col gap-3 rounded-[28px] bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Team</h2>
        <Lives data={data} size={20} />
      </div>
      <p className="text-muted">{teamLabel(game)}</p>
      <TeamStats game={game} activeId={activeId} myId={myId} />
    </div>
  );
}

/** Final screen of a coop game: the team's timeline and everyone's hits. */
export function TeamSummary({ game }: { game: Game }) {
  const cards = [...(timelineData(game).timelines[TEAM] ?? [])].reverse();
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-bold lg:text-xl">Euer Zeitstrahl</h2>
      <ul className="flex flex-wrap gap-1.5">
        {cards.map(c => (
          <li key={c.trackId} title={`${c.name} – ${c.artist}`} className="rounded-full bg-bg px-2.5 py-1 text-sm font-bold tabular-nums">{c.year}</li>
        ))}
      </ul>
      <TeamStats game={game} />
    </div>
  );
}
