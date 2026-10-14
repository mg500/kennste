import { buzzerData } from "@/lib/game/modes/buzzer";
import type { PlayerDetailsProps } from "../types";

/** Songs a player guessed, shown under their row on the final standings. */
export function PlayerDetails({ game, playerId }: PlayerDetailsProps) {
  const songs = buzzerData(game).guessedSongs[playerId] ?? [];
  if (songs.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5 pb-2 pl-14">
      {songs.map((s, i) => (
        <li key={i} className="max-w-full truncate rounded-full bg-bg px-2.5 py-1 text-xs text-muted">
          {s.songName} – {s.artistName}
        </li>
      ))}
    </ul>
  );
}
