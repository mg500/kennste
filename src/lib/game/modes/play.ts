import type { Effect, RoundRecord, Track } from "../types";

/** Starts a song — with "random start" somewhere between 25 % and 60 % of its length instead of the intro. */
export function playEffect(track: Track, randomStart: boolean, random: () => number): Effect {
  const positionMs = randomStart && track.durationMs ? Math.round(track.durationMs * (0.25 + random() * 0.35)) : undefined;
  return { type: "play", trackId: track.id, ...(positionMs ? { positionMs } : {}) };
}

/** A song as it goes into the game's history. */
export function recordedSong(track: Track): RoundRecord["song"] {
  return { trackId: track.id, name: track.name, artist: track.artist, releaseYear: track.releaseYear, albumArt: track.albumArt };
}

/** Ms from the start of the song to `at`, if both are known. */
export function msSince(playingAt: number | undefined, at: number | undefined): number | undefined {
  return playingAt && at && at >= playingAt ? at - playingAt : undefined;
}

/** Song IDs already played, without the running song's (it would give the song away). */
export const playedBefore = (played: string[], current: string | undefined) => played.filter(id => id !== current);

/** Only the viewer's own entry of a per-player record. */
export function onlyOwn<T>(record: Record<string, T>, viewer: string | null): Record<string, T> {
  return viewer !== null && viewer in record ? { [viewer]: record[viewer] } : {};
}
