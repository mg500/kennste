import type { Effect, Track } from "../types";

/** Starts a song — with "random start" somewhere between 25 % and 60 % of its length instead of the intro. */
export function playEffect(track: Track, randomStart: boolean, random: () => number): Effect {
  const positionMs = randomStart && track.durationMs ? Math.round(track.durationMs * (0.25 + random() * 0.35)) : undefined;
  return { type: "play", trackId: track.id, ...(positionMs ? { positionMs } : {}) };
}
