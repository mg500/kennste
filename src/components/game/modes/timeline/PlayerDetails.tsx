import { timelineData } from "@/lib/game/modes/timeline";
import type { PlayerDetailsProps } from "../types";

/** A player's timeline (years only), shown under their row on the final standings. */
export function PlayerDetails({ game, playerId }: PlayerDetailsProps) {
  const cards = timelineData(game).timelines[playerId] ?? [];
  if (cards.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5 pb-2 pl-14">
      {cards.map(c => (
        <li key={c.trackId} title={`${c.name} – ${c.artist}`} className="rounded-full bg-bg px-2.5 py-1 text-xs font-bold tabular-nums text-muted">{c.year}</li>
      ))}
    </ul>
  );
}
