// Original release year of a song via MusicBrainz (free, no API key).
// Spotify's album date is often a remaster or compilation (e.g. 2011 instead of 1975).
// API rules: max. 1 request/second per client, meaningful User-Agent.
// https://musicbrainz.org/doc/MusicBrainz_API

import type { Track } from "./game/types";

const MB = process.env.MUSICBRAINZ_URL ?? "https://musicbrainz.org/ws/2";
const MIN_INTERVAL_MS = 1100;
const USER_AGENT = `SpotifyToolbox/1.0 ( ${process.env.MUSICBRAINZ_CONTACT ?? process.env.NEXTAUTH_URL ?? "self-hosted"} )`;

interface MbRecording {
  title?: string;
  score?: number;
  "first-release-date"?: string;
}

/** "Don't Stop Me Now - Remastered 2011" → "don't stop me now" */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[’`´]/g, "'")
    .replace(/\s+-\s+.*$/, "")          // " - Remastered 2011", " - Single Version"
    .replace(/\s*[([].*?[)\]]/g, "")    // "(Remastered)", "[Live]"
    .replace(/\s+/g, " ")
    .trim();
}

const yearOf = (date?: string) => {
  const y = Number(date?.slice(0, 4));
  return Number.isInteger(y) && y > 1800 ? y : undefined;
};

/** Earliest year among the recordings of an ISRC lookup. */
export function earliestFromIsrc(recordings: MbRecording[]): number | undefined {
  const years = recordings.map(r => yearOf(r["first-release-date"])).filter((y): y is number => y !== undefined);
  return years.length ? Math.min(...years) : undefined;
}

/** Earliest year among confident search hits whose title matches (ignores remaster/live suffixes). */
export function earliestFromSearch(recordings: MbRecording[], title: string): number | undefined {
  const wanted = normalizeTitle(title);
  const years = recordings
    .filter(r => (r.score ?? 0) >= 90 && r.title && normalizeTitle(r.title) === wanted)
    .map(r => yearOf(r["first-release-date"]))
    .filter((y): y is number => y !== undefined);
  return years.length ? Math.min(...years) : undefined;
}

// ── Rate-limited client (one queue for the whole server) ─────────────────────

const g = globalThis as typeof globalThis & {
  __mb__?: { chain: Promise<unknown>; last: number; cache: Map<string, number | null> };
};
const mb = (g.__mb__ ??= { chain: Promise.resolve(), last: 0, cache: new Map() });

function mbFetch<T>(path: string): Promise<T | null> {
  const run = async () => {
    const wait = mb.last + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    mb.last = Date.now();
    try {
      const res = await fetch(`${MB}${path}`, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
      return res.ok ? ((await res.json()) as T) : null;
    } catch {
      return null;
    }
  };
  const result = mb.chain.then(run, run);
  mb.chain = result.catch(() => {});
  return result;
}

const escapeQuery = (s: string) => s.replace(/["\\]/g, "");

/** Looks up the original release year. Returns undefined if MusicBrainz knows nothing better. */
export async function lookupOriginalYear(track: Pick<Track, "name" | "artist" | "isrc">): Promise<number | undefined> {
  const key = track.isrc ?? `${normalizeTitle(track.name)}|${track.artist.toLowerCase()}`;
  if (mb.cache.has(key)) return mb.cache.get(key) ?? undefined;

  let year: number | undefined;
  if (track.isrc) {
    const data = await mbFetch<{ recordings?: MbRecording[] }>(`/isrc/${encodeURIComponent(track.isrc)}?fmt=json`);
    year = earliestFromIsrc(data?.recordings ?? []);
  }
  if (year === undefined) {
    const artist = track.artist.split(",")[0].trim();
    const query = `recording:"${escapeQuery(normalizeTitle(track.name))}" AND artist:"${escapeQuery(artist)}"`;
    const data = await mbFetch<{ recordings?: MbRecording[] }>(`/recording?fmt=json&limit=50&query=${encodeURIComponent(query)}`);
    year = earliestFromSearch(data?.recordings ?? [], track.name);
  }
  mb.cache.set(key, year ?? null);
  return year;
}

/** Returns the track with its year corrected to the original release (never later than Spotify's). */
export async function withOriginalYear(track: Track): Promise<Track> {
  if (track.yearVerified) return track;
  const original = await lookupOriginalYear(track);
  const spotify = yearOf(track.releaseYear);
  const best = [original, spotify].filter((y): y is number => y !== undefined);
  return { ...track, releaseYear: best.length ? String(Math.min(...best)) : track.releaseYear, yearVerified: true };
}
